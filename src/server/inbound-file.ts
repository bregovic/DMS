import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { requestFolder } from "@/server/document-files";
import { extractable } from "@/server/extraction";

/**
 * Zakládání přílohy z doručené pošty do evidence (#41).
 *
 * Jádro odděleně od serverové akce, protože se volá dvěma cestami:
 * z dialogu, kde zařazení potvrdil člověk, a ze samočinného zpracování
 * po příchodu pošty. Oprávnění řeší volající – tahle funkce už jen
 * zakládá.
 */

export type FileTarget = {
  mailId: string;
  userId: string;
  projectId: string;
  requestIds: string[];
  /** Přílohy k založení; `kind` může být přepsaný proti rozpoznání. */
  attachments: { id: string; kind: string }[];
  withEmail: boolean;
};

export type FileResult = {
  documents: number;
  requests: string[];
  /** Dokumenty, na kterých má smysl pustit vytěžení. */
  extractable: string[];
};

/** Přesune soubor ze vstupní složky do cílové – ať neleží v R2 dvakrát. */
async function moveFile(key: string, originalName: string, folder: string) {
  const buf = await storage.read(key);
  const newKey = await storage.save(buf, originalName, folder);
  await storage.delete(key).catch(() => undefined);
  return { newKey, size: buf.length };
}

/**
 * Je tahle příloha v projektu už založená? Dvakrát přeposlaný e-mail je
 * pro poštu nová zpráva (jiné Message-ID), ale příloha je tatáž – bez
 * téhle kontroly by u žádanek přistálo všechno dvojmo.
 */
export async function alreadyFiled(projectId: string, originalName: string, size: number) {
  const d = await prisma.document.findFirst({
    where: { projectId, originalName, size },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return d ?? null;
}

export async function fileInbound(t: FileTarget): Promise<FileResult> {
  const mail = await prisma.inboundMail.findUnique({
    where: { id: t.mailId },
    select: {
      id: true,
      subject: true,
      fromName: true,
      fromAddress: true,
      rawKey: true,
      suggestion: true,
      attachments: { select: { id: true, fileName: true, originalName: true, mimeType: true, size: true, kind: true } },
    },
  });
  if (!mail) throw new Error("Zpráva nenalezena.");
  const project = await prisma.project.findUnique({
    where: { id: t.projectId },
    select: { id: true, ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  const platne = t.requestIds.length
    ? await prisma.request.findMany({
        where: { id: { in: t.requestIds }, projectId: t.projectId },
        select: { id: true, title: true },
      })
    : [];
  if (platne.length !== t.requestIds.length) throw new Error("Některá vybraná žádanka do projektu nepatří.");
  // Hlavní žádanka nese dokument, na kterém stojí vytěžení.
  const requestId = platne[0]?.id ?? null;

  const vybrane = t.attachments
    .map((x) => ({ ...x, a: mail.attachments.find((m) => m.id === x.id) }))
    .filter((x): x is typeof x & { a: NonNullable<typeof x.a> } => !!x.a);
  const withEmail = t.withEmail && !!mail.rawKey;
  if (vybrane.length === 0 && !withEmail) throw new Error("Vyber aspoň jednu přílohu, nebo přilož e-mail.");

  // U přeposlané pošty je odesílatel sám uživatel, proto se k příloze
  // píše dodavatel zjištěný z obsahu. E-mail si nechá odesílatele a předmět.
  const navrh = (mail.suggestion ?? null) as { vendorName?: string | null } | null;
  const dodavatel = navrh?.vendorName?.trim() || null;
  const odesilatel = `${mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress} · ${mail.subject}`;
  const summary = dodavatel ?? odesilatel;
  const docIds: string[] = [];
  let nabidkaDorazila = false;
  let zalozeno = 0;

  // Samotný e-mail jako příloha žádanky (#32) – kontext, ze kterého nabídka přišla.
  if (withEmail && requestId) {
    const nazev = `${mail.subject.slice(0, 60)}.eml`;
    const folder = `${requestFolder(project.ownerId, t.projectId, requestId)}/maily`;
    const { newKey, size } = await moveFile(mail.rawKey!, nazev, folder);
    await prisma.document.create({
      data: {
        projectId: t.projectId,
        requestId,
        summary: odesilatel.slice(0, 500),
        fileName: newKey,
        originalName: nazev,
        mimeType: "message/rfc822",
        size,
        type: "other",
        uploadedById: t.userId,
      },
    });
    await prisma.inboundMail.update({ where: { id: mail.id }, data: { rawKey: null } });
  }

  for (const { a, kind } of vybrane) {
    const isDoc = kind === "invoice" || kind === "receipt";
    const folder = isDoc
      ? `${project.ownerId}/${t.projectId}/invoice`
      : requestId
        ? `${requestFolder(project.ownerId, t.projectId, requestId)}/nabidky`
        : `${project.ownerId}/${t.projectId}/other`;
    const { newKey, size } = await moveFile(a.fileName, a.originalName, folder);
    const zaklad = {
      projectId: t.projectId,
      summary: summary.slice(0, 500),
      // Soubor je v úložišti jeden; u víc žádanek na něj jen ukazuje víc
      // záznamů. Smazání jednoho proto soubor nesmaže (viz deleteWithFiles).
      fileName: newKey,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size,
      type: isDoc ? "invoice" : kind === "offer" ? "offer" : "other",
      uploadedById: t.userId,
    };
    // Faktura patří mezi doklady projektu, ostatní ke všem vybraným žádankám.
    const cile: (string | null)[] = isDoc ? [null] : platne.length ? platne.map((r) => r.id) : [null];
    let prvni: string | null = null;
    for (const cil of cile) {
      const doc = await prisma.document.create({ data: { ...zaklad, requestId: cil }, select: { id: true } });
      if (!prvni) prvni = doc.id;
    }
    zalozeno++;
    await prisma.inboundAttachment.update({
      where: { id: a.id },
      data: { fileName: newKey, documentId: prvni, kind },
    });
    // Vytěžení stačí pustit jednou; propagační materiál se nevytěžuje.
    if (prvni && !isDoc && kind !== "marketing" && requestId && extractable(a.mimeType, a.originalName))
      docIds.push(prvni);
    if (!isDoc && kind === "offer") nabidkaDorazila = true;
  }

  // Došla nabídka → žádanka se posouvá z Poptávky na Nabídku. Dál rozpracované
  // stavy (Vyhovuje, Objednáno, Schváleno) se nevracejí zpátky.
  if (nabidkaDorazila && platne.length)
    await prisma.request.updateMany({
      where: { id: { in: platne.map((r) => r.id) }, status: "poptavka" },
      data: { status: "nabidka" },
    });

  await prisma.inboundMail.update({
    where: { id: mail.id },
    data: {
      status: "zarazena",
      projectId: t.projectId,
      requestId,
      note: [
        `Zařazeno ${new Date().toLocaleString("cs-CZ")} – ${zalozeno} příloh.`,
        platne.length ? `Žádanky: ${platne.map((r) => r.title).join(", ")}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  });

  return { documents: zalozeno, requests: platne.map((r) => r.title), extractable: docIds };
}
