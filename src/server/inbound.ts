import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { fetchUnseen, mailboxConfigured, type FetchedMail } from "@/lib/mailbox";
import { mailTemplate, para, sendMail } from "@/lib/mailer";
import { assertBudget, callModel, AI_MODEL } from "@/server/extraction";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Doručená pošta (#41): přeposlané nabídky a faktury.
 *
 * Postup: vybrat schránku → uložit e-mail i přílohy do vstupní složky →
 * navrhnout, kam patří → poslat zprávu, co se stalo. **Nic se nezakládá
 * samo**; zařazení potvrzuje člověk na stránce Doručená pošta.
 *
 * Kdo smí posílat: e-mail se přijme jen od adresy, kterou DMS zná – od
 * uživatele (pak je jeho), nebo od dodavatele v evidenci (pak patří
 * majiteli té evidence). `From` se dá podvrhnout, proto je to jen filtr
 * proti nevyžádané poště, ne bezpečnostní opatření: vše čeká na potvrzení.
 */

export type MailSuggestion = {
  projectId: string | null;
  requestId: string | null;
  /** offer | invoice | technical | other – co přišlo. */
  kind: string;
  /** Jistota 0–100 a krátké zdůvodnění česky. */
  confidence: number;
  reason: string;
  /** Typ pro jednotlivé přílohy, ve stejném pořadí, jak dorazily. */
  attachmentKinds: string[];
};

const str = { type: ["string", "null"] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const ROUTE_SCHEMA = obj({
  projectId: str,
  requestId: str,
  kind: { type: "string", enum: ["offer", "invoice", "technical", "other"] },
  confidence: { type: "number" },
  reason: { type: "string" },
  attachmentKinds: { type: "array", items: { type: "string", enum: ["offer", "invoice", "technical", "other"] } },
});

const ROUTE_INSTRUCTIONS = `Jsi asistent stavebníka. Přišel přeposlaný e-mail od dodavatele. Urči, kam v evidenci patří.
kind: "offer" = cenová nabídka, "invoice" = faktura nebo zálohová faktura, "technical" = technický list / výkres / specifikace bez cen, "other" = ostatní.
projectId: id projektu ze seznamu, kterého se e-mail týká. Když to z obsahu nejde poznat, vrať null – nehádej.
requestId: id poptávky, ke které e-mail patří. Když pokrývá víc poptávek nebo se nedá určit, vrať null.
attachmentKinds: pro každou přílohu v pořadí, jak je uvedená na vstupu, jeden typ ze stejného číselníku jako kind.
confidence: 0–100, jak jistý si zařazením jsi. Když je projekt i poptávka null, dej nízkou hodnotu.
reason: jedna krátká věta česky, podle čeho ses rozhodl (např. "nabídka na okna od firmy, která je u poptávky Okna v evidenci").`;

/**
 * Porovnání názvů štítku a projektu: bez ohledu na velikost písmen,
 * diakritiku a mezery. U vnořeného štítku („DMS/Dům") platí poslední část.
 */
function labelKey(s: string) {
  return s
    .split("/")
    .pop()!
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diakritika rozložená normalizací
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Projekt podle stejnojmenného štítku z Gmailu (#41). Uživatel přetáhne
 * e-mail pod štítek pojmenovaný jako projekt a tím určí zařazení sám –
 * spolehlivěji než odhad z textu.
 *
 * Vrací i důvod, proč se projekt neurčil, ať je to vidět u zprávy:
 * žádný štítek nesedí, nebo jich sedí víc a není jasné který.
 */
async function projectFromLabels(labels: string[] | undefined, ownerId: string) {
  if (!labels?.length) return { projectId: null as string | null, note: null as string | null };
  const projects = await prisma.project.findMany({ where: { ownerId }, select: { id: true, name: true } });
  const byKey = new Map(projects.map((p) => [labelKey(p.name), p]));
  const hits = [...new Set(labels.map(labelKey))].map((k) => byKey.get(k)).filter((p) => !!p);
  if (hits.length === 1) return { projectId: hits[0]!.id, note: `Projekt podle štítku „${hits[0]!.name}".` };
  if (hits.length > 1)
    return {
      projectId: null,
      note: `Štítky odpovídají víc projektům (${hits.map((p) => p!.name).join(", ")}) – vyber projekt ručně.`,
    };
  return { projectId: null, note: null };
}

/** Kdo poštu dostane: uživatel se shodným e-mailem, jinak dodavatel → jeho majitel. */
async function resolveOwner(fromAddress: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: fromAddress, mode: "insensitive" } },
    select: { id: true, email: true, name: true },
  });
  if (user) return { ownerId: user.id, via: "uživatel" as const };
  const vendor = await prisma.vendor.findFirst({
    where: { email: { equals: fromAddress, mode: "insensitive" } },
    select: { ownerId: true, name: true },
  });
  if (vendor) return { ownerId: vendor.ownerId, via: `dodavatel ${vendor.name}` as const };
  return null;
}

/**
 * Projekty a otevřené poptávky majitele – podklad pro zařazení. Když je
 * projekt určený štítkem, vrátí se jen on a model řeší už jen poptávku.
 */
async function routingContext(ownerId: string, onlyProjectId?: string | null) {
  const projects = await prisma.project.findMany({
    where: { ownerId, ...(onlyProjectId ? { id: onlyProjectId } : {}) },
    select: {
      id: true,
      name: true,
      requests: {
        where: { status: { notIn: ["schvaleno", "zruseno"] } },
        select: { id: true, title: true, description: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return projects.map((p) => ({
    projectId: p.id,
    projekt: p.name,
    poptavky: p.requests.map((r) => ({
      requestId: r.id,
      nazev: r.title,
      specifikace: r.description?.slice(0, 300) ?? null,
    })),
  }));
}

/** Návrh zařazení. Když AI není k dispozici, vrátí prázdný návrh – není to chyba. */
async function suggestRouting(
  mail: FetchedMail,
  ownerId: string,
  forcedProjectId?: string | null,
): Promise<MailSuggestion | null> {
  const ctx = await routingContext(ownerId, forcedProjectId);
  if (ctx.length === 0) return null;
  try {
    await assertBudget();
  } catch {
    return null; // limity nebo vypnuté zpracování – pošta se uloží bez návrhu
  }
  try {
    const { data } = await callModel<MailSuggestion>(
      AI_MODEL,
      ROUTE_INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Projekty a otevřené poptávky:\n${JSON.stringify(ctx, null, 1)}\n\n` +
            `E-mail\nOd: ${mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress}\n` +
            `Předmět: ${mail.subject}\n` +
            `Přílohy: ${mail.attachments.map((a) => a.originalName).join(", ") || "žádné"}\n\n` +
            `Text:\n${(mail.bodyText ?? "").slice(0, 6000)}`,
        },
      ],
      "mail-routing",
      ROUTE_SCHEMA,
      { effort: "low", maxOutput: 2_000 },
    );
    // Vymyšlená id zahodit – radši bez návrhu než špatně zařazené.
    const project = ctx.find((p) => p.projectId === data.projectId) ?? null;
    const request = project?.poptavky.find((r) => r.requestId === data.requestId) ?? null;
    return {
      ...data,
      projectId: project?.projectId ?? null,
      requestId: request?.requestId ?? null,
    };
  } catch {
    return null;
  }
}

export type IngestResult = {
  fetched: number;
  stored: number;
  skipped: { subject: string; reason: string }[];
  mails: { id: string; subject: string; from: string; attachments: number; suggestion: string }[];
};

/**
 * Vybere schránku a uloží novou poštu do vstupní složky. Vrací přehled,
 * který se pak posílá zpět e-mailem.
 */
export async function ingestMailbox(): Promise<IngestResult> {
  const res: IngestResult = { fetched: 0, stored: 0, skipped: [], mails: [] };
  if (!mailboxConfigured()) throw new Error("Schránka pro příjem pošty není nastavená.");

  const mails = await fetchUnseen();
  res.fetched = mails.length;
  for (const mail of mails) await storeMail(mail, res);
  return res;
}

/**
 * Uložit jednu zprávu do vstupní složky a zapsat výsledek do přehledu.
 * Sdílené pro obě cesty, kterými pošta přichází: vybrání schránky přes IMAP
 * a skript v Gmailu, který zprávu pošle rovnou do DMS (#41).
 */
export async function storeMail(mail: FetchedMail, res: IngestResult) {
  try {
    const dup = await prisma.inboundMail.findUnique({
      where: { messageId: mail.messageId },
      select: { id: true },
    });
    if (dup) {
      res.skipped.push({ subject: mail.subject, reason: "už byl zpracovaný dřív" });
      return;
    }
    const owner = await resolveOwner(mail.fromAddress);
    if (!owner) {
      res.skipped.push({ subject: mail.subject, reason: `neznámý odesílatel ${mail.fromAddress}` });
      return;
    }

    // Štítek pojmenovaný jako projekt má přednost před odhadem z textu.
    const fromLabel = await projectFromLabels(mail.labels, owner.ownerId);
    const suggestion = await suggestRouting(mail, owner.ownerId, fromLabel.projectId);
    const row = await prisma.inboundMail.create({
      data: {
        messageId: mail.messageId,
        fromName: mail.fromName,
        fromAddress: mail.fromAddress,
        subject: mail.subject.slice(0, 500),
        receivedAt: mail.receivedAt,
        bodyText: mail.bodyText?.slice(0, 20_000) ?? null,
        ownerId: owner.ownerId,
        projectId: fromLabel.projectId ?? suggestion?.projectId ?? null,
        requestId: suggestion?.requestId ?? null,
        suggestion: (suggestion ?? undefined) as unknown as Prisma.InputJsonValue,
        note: [`Přijato od ${owner.via}.`, fromLabel.note].filter(Boolean).join(" "),
      },
      select: { id: true },
    });

    const folder = `${owner.ownerId}/posta/${row.id}`;
    // Originál e-mailu je nepovinný – skript v Gmailu ho nemusí poslat.
    const rawKey = mail.raw ? await storage.save(mail.raw, "original.eml", folder).catch(() => null) : null;
    for (const [i, a] of mail.attachments.entries()) {
      const key = await storage.save(a.content, a.originalName, folder);
      await prisma.inboundAttachment.create({
        data: {
          mailId: row.id,
          fileName: key,
          originalName: a.originalName.slice(0, 300),
          mimeType: a.mimeType,
          size: a.size,
          kind: suggestion?.attachmentKinds?.[i] ?? suggestion?.kind ?? "other",
        },
      });
    }
    if (rawKey) await prisma.inboundMail.update({ where: { id: row.id }, data: { rawKey } });

    res.stored++;
    res.mails.push({
      id: row.id,
      subject: mail.subject,
      from: mail.fromAddress,
      attachments: mail.attachments.length,
      suggestion: fromLabel.note
        ? `${fromLabel.note}${suggestion?.reason ? ` ${suggestion.reason}` : ""}`
        : (suggestion?.reason ?? "zařazení se nepodařilo určit"),
    });
  } catch (err) {
    res.skipped.push({
      subject: mail.subject,
      reason: err instanceof Error ? err.message : "neznámá chyba",
    });
  }
}

/** Zpráva o zpracování pošty – co dorazilo, co se uložilo a co ne. */
export async function reportIngest(result: IngestResult, to: string, baseUrl: string) {
  if (!to) return { sent: false };
  const lines: string[] = [];
  if (result.stored === 0 && result.skipped.length === 0) return { sent: false }; // nic nepřišlo, nespamovat

  if (result.stored > 0) {
    lines.push(`<b>Uloženo do Doručené pošty: ${result.stored}</b>`);
    for (const m of result.mails)
      lines.push(
        para(
          `• ${m.subject} — od ${m.from}, ${m.attachments === 0 ? "bez příloh" : `příloh: ${m.attachments}`}\n   ${m.suggestion}`,
        ),
      );
  }
  if (result.skipped.length > 0) {
    lines.push(`<b>Nezpracováno: ${result.skipped.length}</b>`);
    for (const s of result.skipped) lines.push(para(`• ${s.subject} — ${s.reason}`));
  }
  lines.push("Nic se nezaložilo samo – zařazení potvrď v DMS.");

  const { html, text } = mailTemplate({
    title: `Doručená pošta: ${result.stored} ${result.stored === 1 ? "zpráva" : result.stored < 5 ? "zprávy" : "zpráv"}`,
    lines,
    action: { label: "Otevřít Doručenou poštu", href: `${baseUrl}/posta` },
  });
  return sendMail({ to, subject: `DMS – doručená pošta (${result.stored})`, html, text });
}
