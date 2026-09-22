"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole, isManager } from "@/server/access";
import { requestFolder } from "@/server/document-files";
import { createExtraction, extractable, runExtraction } from "@/server/extraction";
import { ingestMailbox, reportIngest } from "@/server/inbound";

/**
 * Doručená pošta (#41) – zařazení přeposlané pošty do evidence.
 *
 * Nic se nezakládá samo: uživatel vybere projekt (a případně žádanku),
 * zaškrtne, které přílohy chce, a teprve pak vzniknou dokumenty.
 * Faktura míří mezi doklady projektu, nabídka k žádance (a rovnou se
 * nabídne její zpracování).
 */

/** Pošta patří svému majiteli; cizí schránku nikdo needituje. */
async function mailCtx(mailId: string) {
  const user = await requireUser();
  const mail = await prisma.inboundMail.findUnique({
    where: { id: mailId },
    select: {
      id: true,
      ownerId: true,
      status: true,
      subject: true,
      fromName: true,
      fromAddress: true,
      receivedAt: true,
      rawKey: true,
      attachments: {
        select: { id: true, fileName: true, originalName: true, mimeType: true, size: true, kind: true, documentId: true },
      },
    },
  });
  if (!mail) throw new Error("Zpráva nenalezena.");
  if (mail.ownerId !== user.id) throw new Error("Tahle pošta ti nepatří.");
  return { user, mail };
}

/** Ruční vybrání schránky ze stránky Doručená pošta. */
export async function runMailbox() {
  const user = await requireUser();
  const result = await ingestMailbox();
  const to = user.email;
  if (to)
    after(() =>
      reportIngest(result, to, process.env.APP_URL || "https://dokumenty.up.railway.app").catch(() => {}),
    );
  revalidatePath("/posta");
  return { fetched: result.fetched, stored: result.stored, skipped: result.skipped.length };
}

/** Přesune soubor ze vstupní složky do cílové – ať neleží v R2 dvakrát. */
async function moveFile(key: string, originalName: string, folder: string) {
  const buf = await storage.read(key);
  const newKey = await storage.save(buf, originalName, folder);
  await storage.delete(key).catch(() => undefined);
  return { newKey, size: buf.length };
}

/**
 * Založit z e-mailu dokumenty. Faktura a účtenka jdou mezi doklady projektu
 * (kde je čeká vytěžení), ostatní k vybrané žádance.
 */
export async function fileMail(formData: FormData) {
  const { user, mail } = await mailCtx(String(formData.get("mailId")));
  if (mail.status === "zarazena") throw new Error("Tahle zpráva už je zařazená.");

  const projectId = String(formData.get("projectId") || "");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, ownerId: true } });
  if (!project) throw new Error("Vyber projekt.");
  if (!isManager(await getProjectRole(project.id, user))) throw new Error("Do tohoto projektu nemáš přístup.");

  // Nabídka od jednoho dodavatele bývá na víc věcí najednou, proto víc žádanek.
  const requestIds = [...new Set(formData.getAll("requestIds").map(String).filter(Boolean))];
  const platne = requestIds.length
    ? await prisma.request.findMany({
        where: { id: { in: requestIds }, projectId },
        select: { id: true, title: true, subProjectId: true },
      })
    : [];
  if (platne.length !== requestIds.length) throw new Error("Některá vybraná žádanka do projektu nepatří.");
  // Hlavní žádanka nese dokument (vytěžení potřebuje na čem stát).
  const requestId = platne[0]?.id ?? null;

  const picked = mail.attachments.filter((a) => formData.get(`use_${a.id}`) === "1");
  const withEmail = formData.get("withEmail") === "1" && !!mail.rawKey;
  if (picked.length === 0 && !withEmail) throw new Error("Vyber aspoň jednu přílohu, nebo přilož e-mail.");

  const summary = `${mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress} · ${mail.subject}`;
  const docIds: string[] = [];

  /**
   * Nabídka na víc žádanek se zakládá jako společná nabídka poptávkového
   * balíčku (#40): soubor leží jednou a je dostupný u všech jeho žádanek.
   * Balíček se použije existující (když už v něm vybrané žádanky jsou),
   * jinak vznikne nový pod zadaným názvem.
   */
  let bundleOfferId: string | null = null;
  if (platne.length > 1) {
    const stavajici = await prisma.request.findFirst({
      where: { id: { in: platne.map((r) => r.id) }, bundleId: { not: null } },
      select: { bundleId: true },
    });
    let bundleId = stavajici?.bundleId ?? null;
    if (!bundleId) {
      const nazev = String(formData.get("bundleName") || "").trim() || "Společná poptávka";
      bundleId = (
        await prisma.requestBundle.create({
          data: { projectId, name: nazev.slice(0, 200), createdById: user.id },
          select: { id: true },
        })
      ).id;
    }
    await prisma.request.updateMany({ where: { id: { in: platne.map((r) => r.id) } }, data: { bundleId } });

    const offer = await prisma.bundleOffer.create({
      data: {
        bundleId,
        // Dodavatele i ceny doplní vytěžení nebo uživatel – teď známe jen odesílatele.
        vendorName: mail.fromName?.slice(0, 200) ?? mail.fromAddress,
        note: `Z e-mailu: ${mail.subject}`.slice(0, 500),
        createdById: user.id,
      },
      select: { id: true, status: true },
    });
    bundleOfferId = offer.id;
    for (const r of platne) {
      await prisma.offer.create({
        data: {
          requestId: r.id,
          bundleOfferId: offer.id,
          vendorName: offer.status === "nova" ? (mail.fromName ?? mail.fromAddress) : null,
          status: offer.status,
          createdById: user.id,
        },
      });
    }
  }

  // Samotný e-mail jako příloha žádanky (#32) – kontext, ze kterého nabídka přišla.
  if (withEmail && requestId) {
    const folder = `${requestFolder(project.ownerId, projectId, requestId)}/maily`;
    const { newKey, size } = await moveFile(mail.rawKey!, `${mail.subject.slice(0, 60)}.eml`, folder);
    await prisma.document.create({
      data: {
        projectId,
        requestId,
        summary: summary.slice(0, 500),
        fileName: newKey,
        originalName: `${mail.subject.slice(0, 60)}.eml`,
        mimeType: "message/rfc822",
        size,
        type: "other",
        uploadedById: user.id,
      },
    });
    await prisma.inboundMail.update({ where: { id: mail.id }, data: { rawKey: null } });
  }

  for (const a of picked) {
    // Typ se dá u každé přílohy přepsat – rozpoznání je jen návrh.
    const kind = String(formData.get(`kind_${a.id}`) || a.kind);
    const isDoc = kind === "invoice" || kind === "receipt";
    const folder = isDoc
      ? `${project.ownerId}/${projectId}/invoice`
      : requestId
        ? `${requestFolder(project.ownerId, projectId, requestId)}/nabidky`
        : `${project.ownerId}/${projectId}/other`;
    const { newKey, size } = await moveFile(a.fileName, a.originalName, folder);
    const doc = await prisma.document.create({
      data: {
        projectId,
        // Faktura patří mezi doklady projektu (bez vazby na žádanku),
        // ostatní k žádance – tam na ně navazuje zpracování nabídky.
        requestId: isDoc ? null : requestId,
        // U nabídky na víc žádanek navíc vazba na společnou nabídku, aby
        // byl tentýž soubor dostupný u celého balíčku.
        bundleOfferId: isDoc ? null : bundleOfferId,
        summary: summary.slice(0, 500),
        fileName: newKey,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size,
        type: isDoc ? "invoice" : kind === "offer" ? "offer" : "other",
        uploadedById: user.id,
      },
      select: { id: true },
    });
    await prisma.inboundAttachment.update({
      where: { id: a.id },
      data: { fileName: newKey, documentId: doc.id, kind },
    });
    if (!isDoc && requestId && extractable(a.mimeType, a.originalName)) docIds.push(doc.id);
  }

  await prisma.inboundMail.update({
    where: { id: mail.id },
    data: {
      status: "zarazena",
      projectId,
      requestId,
      note: [
        `Zařazeno ${new Date().toLocaleString("cs-CZ")} – ${picked.length} příloh.`,
        platne.length > 1 ? `Společná nabídka na ${platne.length} žádanek: ${platne.map((r) => r.title).join(", ")}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  });

  // Zpracování nabídek pustit na pozadí, jednu po druhé (limity souběhu).
  if (docIds.length && formData.get("extract") === "1") {
    after(async () => {
      for (const id of docIds) {
        try {
          const ex = await createExtraction(id, user.id);
          await runExtraction(ex);
        } catch {
          break; // vyčerpaný limit – zbytek jde spustit ručně u žádanky
        }
      }
    });
  }

  revalidatePath("/posta");
  revalidatePath(`/projects/${projectId}`);
  return { documents: picked.length, extracting: docIds.length, bundled: platne.length > 1 };
}

export async function dismissMail(formData: FormData) {
  const { mail } = await mailCtx(String(formData.get("mailId")));
  await prisma.inboundMail.update({
    where: { id: mail.id },
    data: { status: "odmitnuta", note: "Odmítnuto ručně." },
  });
  revalidatePath("/posta");
}

export async function deleteMail(formData: FormData) {
  const { mail } = await mailCtx(String(formData.get("mailId")));
  // Soubory, které ještě leží ve vstupní složce (nezařazené), smazat z úložiště.
  const keys = [mail.rawKey, ...mail.attachments.filter((a) => !a.documentId).map((a) => a.fileName)].filter(
    (k): k is string => !!k,
  );
  await prisma.inboundMail.delete({ where: { id: mail.id } });
  await Promise.all(keys.map((k) => storage.delete(k).catch(() => undefined)));
  revalidatePath("/posta");
}

/**
 * Složky a žádanky projektu pro rozbalovátka v dialogu zařazení.
 * Žádanka si nese složku, ve které leží, aby šlo filtrovat i rozlišit
 * stejně pojmenované položky ve dvou složkách.
 */
export async function projectOptions(projectId: string) {
  const user = await requireUser();
  if (!projectId) return { folders: [], requests: [] };
  if (!isManager(await getProjectRole(projectId, user))) return { folders: [], requests: [] };
  const [folders, requests] = await Promise.all([
    prisma.subProject.findMany({
      where: { projectId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.request.findMany({
      where: { projectId, status: { notIn: ["schvaleno", "zruseno"] } },
      select: { id: true, title: true, subProjectId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { folders, requests };
}

/** Nastavení e-mailových oznámení (Nastavení → Oznámení). */
export async function saveNotifySettings(formData: FormData) {
  const user = await requireUser();
  const email = String(formData.get("notifyEmail") || "").trim().toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Zadej platný e-mail.");
  await prisma.user.update({
    where: { id: user.id },
    data: { notifyByEmail: formData.get("notifyByEmail") === "1", notifyEmail: email || null },
  });
  revalidatePath("/settings");
}
