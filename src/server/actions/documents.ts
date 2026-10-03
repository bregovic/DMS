"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createExtraction, extractable, runExtraction } from "@/server/extraction";
import { requestFolder } from "@/server/document-files";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole, isManager, canWrite } from "@/server/access";
import { assertUploadQuota } from "@/server/upload-quota";
import { resolveDocTypeKey } from "@/server/document-types";
import { emlSummary, parseEmlHeader } from "@/lib/eml";

// Server actions mají strop 15 MB na odeslání (next.config) – soubor do 14 MB se vejde.
const MAX_UPLOAD = 14 * 1024 * 1024;

/** Připojí doklad k příjmu (vystavená faktura, příjmový doklad). */
export async function attachIncomeDocument(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const incomeId = String(formData.get("incomeId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Vyber soubor.");
  if (file.size > MAX_UPLOAD) throw new Error("Soubor je větší než 14 MB.");

  const role = await getProjectRole(projectId, user);
  if (!isManager(role)) throw new Error("Nemáš oprávnění.");
  const income = await prisma.income.findFirst({ where: { id: incomeId, projectId }, select: { id: true } });
  if (!income) throw new Error("Příjem nenalezen.");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");

  const docType = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name) ? "invoice" : "receipt";
  const key = await storage.save(Buffer.from(await file.arrayBuffer()), file.name, `${project.ownerId}/${projectId}/${docType}`);
  const doc = await prisma.document.create({
    data: {
      projectId,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType,
      uploadedById: user.id,
    },
    select: { id: true },
  });
  await prisma.income.update({ where: { id: incomeId }, data: { documentId: doc.id } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/doklady");
  return { documentId: doc.id };
}

/** Připojí sken k existující položce (výdaji). Owner ke všem, aktivní dodavatel jen ke svým. */
export async function attachExpenseScan(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const expenseId = String(formData.get("expenseId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Vyber soubor.");
  }
  if (file.size > MAX_UPLOAD) {
    throw new Error("Soubor je větší než 14 MB.");
  }

  const role = await getProjectRole(projectId, user);
  if (!canWrite(role)) {
    throw new Error("Nemáš oprávnění.");
  }

  const expense = await prisma.expense.findFirst({
    where: {
      id: expenseId,
      projectId,
      ...(role === "active" ? { createdById: user.id } : {}),
    },
    select: { id: true },
  });
  if (!expense) throw new Error("Položka nenalezena.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  const docType = String(formData.get("type") || "receipt");
  await assertUploadQuota(user, projectId, file.size);
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await storage.save(
    buffer,
    file.name,
    `${project.ownerId}/${projectId}/${docType}`,
  );
  await prisma.document.create({
    data: {
      projectId,
      expenseId,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType,
      uploadedById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function uploadDocument(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const expenseRaw = formData.get("expenseId");
  const expenseId = expenseRaw ? String(expenseRaw) : null;
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Vyber soubor k nahrání.");
  }

  if (file.size > MAX_UPLOAD) {
    throw new Error("Soubor je větší než 14 MB.");
  }

  // Doklad (účtenka, faktura) nahraje i dodavatel – ten je na stavbě a má ho
  // v ruce. Ostatní dokumentace projektu (smlouvy, revize, pojistky) i zakládání
  // nového typu zůstává vlastníkovi a spolusprávci.
  const rawType = String(formData.get("type") || "other");
  const role = await getProjectRole(projectId, user);
  const isReceipt = rawType === "receipt" || rawType === "invoice";
  if (!isManager(role) && !(isReceipt && canWrite(role)))
    throw new Error("Dokumenty projektu nahrává správce projektu.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  let docType = rawType;
  if (docType === "__new__") {
    docType = await resolveDocTypeKey(String(formData.get("newType") || ""));
  }
  // Složka, ve které se nahrávalo – čtení ji pak nehádá z obsahu.
  const subRaw = String(formData.get("subProjectId") || "").trim();
  const subProjectId = subRaw
    ? (await prisma.subProject.findFirst({ where: { id: subRaw, projectId }, select: { id: true } }))?.id ?? null
    : null;
  await assertUploadQuota(user, projectId, file.size);
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await storage.save(
    buffer,
    file.name,
    `${project.ownerId}/${projectId}/${docType}`,
  );

  const doc = await prisma.document.create({
    data: {
      projectId,
      subProjectId,
      expenseId,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType,
      uploadedById: user.id,
    },
    select: { id: true, mimeType: true, originalName: true },
  });

  // Doklad se přečte hned po nahrání; ostatní dokumentace projektu ne.
  if (isReceipt) {
    const { scanAfterUpload } = await import("@/server/doc-scan");
    await scanAfterUpload(projectId, doc.id, user.id);
  }
  // Doklad od dodavatele správcům ohlásíme, jinak by o něm nevěděli.
  if (!isManager(role)) {
    const { notifyDocUploaded } = await import("@/server/notify");
    await notifyDocUploaded(projectId, user, { id: doc.id, name: doc.originalName });
  }

  revalidatePath("/doklady");
  revalidatePath(`/projects/${projectId}`);
}

/** Kolik souborů jde k žádance přiložit najednou. */
const MAX_REQUEST_FILES = 10;

/**
 * E-maily a přílohy hlavičky žádanky (#32).
 *
 * Nabídky chodí e-mailem – ukládá se buď celý e-mail (.eml z pošty,
 * .msg z Outlooku), nebo rovnou PDF/obrázek nabídky. U .eml se z hlavičky
 * vytáhne odesílatel a předmět, ať je v seznamu vidět, o čem zpráva je.
 * Z těchhle podkladů se později dají vytěžit dodavatelé a nabídky (#33).
 *
 * Správce smí přikládat ke všem žádankám, aktivní dodavatel jen ke svým.
 */
export async function attachRequestFiles(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const requestId = String(formData.get("requestId"));

  const role = await getProjectRole(projectId, user);
  if (!canWrite(role)) throw new Error("Nemáš oprávnění.");

  const request = await prisma.request.findFirst({
    where: {
      id: requestId,
      projectId,
      ...(role === "active" ? { createdById: user.id } : {}),
    },
    select: { id: true, project: { select: { ownerId: true } } },
  });
  if (!request) throw new Error("Žádanka nenalezena.");

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Vyber soubor.");
  if (files.length > MAX_REQUEST_FILES) {
    throw new Error(`Najednou jde přiložit nejvýš ${MAX_REQUEST_FILES} souborů.`);
  }
  const tooBig = files.find((f) => f.size > MAX_UPLOAD);
  if (tooBig) throw new Error(`Soubor „${tooBig.name}" je větší než 14 MB.`);
  await assertUploadQuota(user, projectId, files.reduce((a, f) => a + f.size, 0));

  const [emailType, offerType] = await Promise.all([
    resolveDocTypeKey("E-mail"),
    resolveDocTypeKey("Nabídka"),
  ]);

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const isEml = lower.endsWith(".eml");
    const isMsg = lower.endsWith(".msg");
    const docType = isEml || isMsg ? emailType : offerType;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Typ podle přípony, ne podle prohlížeče: .eml jako message/rfc822 se
    // stáhne, místo aby se zkoušel zobrazit jako text.
    const mimeType = isEml
      ? "message/rfc822"
      : isMsg
        ? "application/vnd.ms-outlook"
        : file.type || "application/octet-stream";

    const summary = isEml ? emlSummary(parseEmlHeader(buffer)) : null;

    const key = await storage.save(
      buffer,
      file.name,
      requestFolder(request.project.ownerId, projectId, request.id),
    );
    const doc = await prisma.document.create({
      data: {
        projectId,
        requestId: request.id,
        fileName: key,
        originalName: file.name,
        mimeType,
        size: file.size,
        type: docType,
        summary,
        uploadedById: user.id,
      },
    });

    // Nabídka v PDF / na fotce → rovnou vytěžit přes AI (#33). Běží na pozadí,
    // výsledek je jen návrh k potvrzení. Bez klíče nebo po vyčerpání limitu se
    // prostě nespustí – nahrání přílohy tím nesmí selhat.
    if (docType === offerType && extractable(mimeType, file.name)) {
      try {
        const exId = await createExtraction(doc.id, user.id);
        after(() => runExtraction(exId));
      } catch {}
    }
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteDocument(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));

  const doc = await prisma.document.findUnique({
    where: { id },
    include: { project: { select: { ownerId: true } } },
  });
  if (!doc) return;

  // Vlastník i spolusprávce smažou cokoliv; aktivní dodavatel jen to, co sám nahrál.
  let allowed = doc.project.ownerId === user.id;
  if (!allowed) {
    const role = await getProjectRole(doc.projectId, user);
    if (isManager(role)) allowed = true;
    else if (doc.uploadedById === user.id && role === "active") allowed = true;
  }
  if (!allowed) return;

  // Nejdřív záznam, pak soubor – při chybě databáze nezůstane odkaz na smazaný soubor.
  await prisma.document.delete({ where: { id: doc.id } });
  await storage.delete(doc.fileName).catch(() => {});

  revalidatePath(`/projects/${doc.projectId}`);
}

/** Poznámka k dokumentu – např. co se oproti dokumentaci změnilo (AI ji použije). */
export async function updateDocumentNote(formData: FormData) {
  const user = await requireUser();
  const doc = await prisma.document.findUnique({
    where: { id: String(formData.get("id")) },
    select: { id: true, projectId: true },
  });
  if (!doc) throw new Error("Dokument nenalezen.");
  if (!isManager(await getProjectRole(doc.projectId, user))) throw new Error("Poznámku mění správce projektu.");
  await prisma.document.update({
    where: { id: doc.id },
    data: { note: String(formData.get("note") || "").trim().slice(0, 4000) || null },
  });
  revalidatePath(`/projects/${doc.projectId}`);
  revalidatePath(`/projects/${doc.projectId}/prilohy`);
}

/**
 * Textová poznámka k dokumentaci projektu (změny oproti projektu, požadavky,
 * domluvy…). Uloží se jako .txt dokument – plánování ji načte stejně jako
 * ostatní dokumentaci.
 */
export async function createTextNote(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  if (!isManager(await getProjectRole(projectId, user))) throw new Error("Poznámky přidává správce projektu.");
  const title = String(formData.get("title") || "").trim().slice(0, 120) || "Poznámka";
  const text = String(formData.get("text") || "").trim();
  if (!text) throw new Error("Napiš text poznámky.");
  if (text.length > 50_000) throw new Error("Poznámka je příliš dlouhá.");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");
  const docType = await resolveDocTypeKey("Poznámka");
  const buffer = Buffer.from(`${title}\n\n${text}\n`, "utf8");
  const fileName = `${title.replace(/[\/:*?"<>|]+/g, "-")}.txt`;
  const key = await storage.save(buffer, fileName, `${project.ownerId}/${projectId}/${docType}`);
  await prisma.document.create({
    data: {
      projectId,
      fileName: key,
      originalName: fileName,
      mimeType: "text/plain",
      size: buffer.length,
      type: docType,
      summary: text.slice(0, 200),
      uploadedById: user.id,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/prilohy`);
}
