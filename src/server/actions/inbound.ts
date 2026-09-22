"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole, isManager } from "@/server/access";
import { createExtraction, runExtraction } from "@/server/extraction";
import { fileInbound } from "@/server/inbound-file";
import { ingestMailbox, reportIngest, suggestRouting } from "@/server/inbound";
import type { Prisma } from "@/generated/prisma/client";

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

export async function fileMail(formData: FormData) {
  const { user, mail } = await mailCtx(String(formData.get("mailId")));
  if (mail.status === "zarazena") throw new Error("Tahle zpráva už je zařazená.");

  const projectId = String(formData.get("projectId") || "");
  if (!isManager(await getProjectRole(projectId, user))) throw new Error("Do tohoto projektu nemáš přístup.");

  const res = await fileInbound({
    mailId: mail.id,
    userId: user.id,
    projectId,
    requestIds: [...new Set(formData.getAll("requestIds").map(String).filter(Boolean))],
    attachments: mail.attachments
      .filter((a) => formData.get(`use_${a.id}`) === "1")
      .map((a) => ({ id: a.id, kind: String(formData.get(`kind_${a.id}`) || a.kind) })),
    withEmail: formData.get("withEmail") === "1",
  });

  // Zpracování nabídek pustit na pozadí, jednu po druhé (limity souběhu).
  if (res.extractable.length && formData.get("extract") === "1") {
    after(async () => {
      for (const id of res.extractable) {
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
  return { documents: res.documents, extracting: res.extractable.length, requests: res.requests.length };
}

/**
 * Přepočítat návrh zařazení u už uložené zprávy. Hodí se, když mezitím
 * přibyly žádanky – nebo když se zlepšilo samo rozpoznávání a stará pošta
 * má návrh z dřívějška.
 */
export async function resuggestMail(formData: FormData) {
  const { mail } = await mailCtx(String(formData.get("mailId")));
  const row = await prisma.inboundMail.findUnique({
    where: { id: mail.id },
    select: {
      id: true,
      ownerId: true,
      subject: true,
      fromName: true,
      fromAddress: true,
      bodyText: true,
      receivedAt: true,
      projectId: true,
      subProjectId: true,
      attachments: { select: { id: true, fileName: true, originalName: true, mimeType: true, size: true } },
    },
  });
  if (!row) throw new Error("Zpráva nenalezena.");

  const suggestion = await suggestRouting(
    {
      messageId: row.id,
      fromName: row.fromName,
      fromAddress: row.fromAddress,
      subject: row.subject,
      receivedAt: row.receivedAt,
      bodyText: row.bodyText,
      // Přílohy i s obsahem – rozpis položek bývá v nich, ne v těle e-mailu.
      attachments: await Promise.all(
        row.attachments.map(async (a) => ({
          originalName: a.originalName,
          mimeType: a.mimeType,
          size: a.size,
          content: await storage.read(a.fileName).catch(() => Buffer.alloc(0)),
        })),
      ),
    },
    row.ownerId,
    { projectId: row.projectId, subProjectId: row.subProjectId },
  );
  if (!suggestion) throw new Error("Návrh se nepodařilo spočítat – zkus to za chvíli.");

  await prisma.inboundMail.update({
    where: { id: row.id },
    data: {
      // Projekt ze štítku zůstává, ten určil člověk.
      projectId: row.projectId ?? suggestion.projectId,
      requestId: suggestion.requestId,
      suggestion: suggestion as unknown as Prisma.InputJsonValue,
    },
  });
  // Typy příloh se přepočítávají taky – jinak by u starší pošty zůstalo
  // zařazení z doby, kdy rozpoznávání umělo míň.
  const kinds = suggestion.attachmentKinds ?? [];
  for (const [i, a] of row.attachments.entries()) {
    if (kinds[i]) await prisma.inboundAttachment.update({ where: { id: a.id }, data: { kind: kinds[i] } });
  }

  revalidatePath("/posta");
  return { requests: suggestion.requestIds.length };
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
