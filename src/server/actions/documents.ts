"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createExtraction, extractable, runExtraction } from "@/server/extraction";
import { requestFolder } from "@/server/document-files";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole, isManager, canWrite } from "@/server/access";
import { resolveDocTypeKey } from "@/server/document-types";
import { emlSummary, parseEmlHeader } from "@/lib/eml";

// Server actions mají strop 15 MB na odeslání (next.config) – soubor do 14 MB se vejde.
const MAX_UPLOAD = 14 * 1024 * 1024;

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

  // Vlastník i spolusprávce (dřív jen vlastník).
  if (!isManager(await getProjectRole(projectId, user))) throw new Error("Dokumenty projektu nahrává správce projektu.");
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  let docType = String(formData.get("type") || "other");
  if (docType === "__new__") {
    docType = await resolveDocTypeKey(String(formData.get("newType") || ""));
  }
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

  await storage.delete(doc.fileName);
  await prisma.document.delete({ where: { id: doc.id } });

  revalidatePath(`/projects/${doc.projectId}`);
}
