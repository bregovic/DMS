import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { fetchUnseen, mailboxConfigured, type FetchedMail } from "@/lib/mailbox";
import { mailTemplate, para, sendMail } from "@/lib/mailer";
import { assertBudget, callModel, AI_MODEL } from "@/server/extraction";
import { notifyUsers } from "@/server/notify";
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
  /** Všechny poptávky, které nabídka pokrývá – jedna nabídka bývá na víc věcí. */
  requestIds: string[];
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
  requestIds: { type: "array", items: { type: "string" } },
  kind: { type: "string", enum: ["offer", "invoice", "technical", "other"] },
  confidence: { type: "number" },
  reason: { type: "string" },
  attachmentKinds: { type: "array", items: { type: "string", enum: ["offer", "invoice", "technical", "other"] } },
});

const ROUTE_INSTRUCTIONS = `Jsi asistent stavebníka. Přišel přeposlaný e-mail od dodavatele. Urči, kam v evidenci patří.
kind: "offer" = cenová nabídka, "invoice" = faktura nebo zálohová faktura, "technical" = technický list / výkres / specifikace bez cen, "other" = ostatní.
projectId: id projektu ze seznamu, kterého se e-mail týká. Když to z obsahu nejde poznat, vrať null – nehádej.
requestIds: id **všech** poptávek, které dokument pokrývá. Tohle je to podstatné – nabídka od jednoho dodavatele bývá na víc věcí najednou (okna + dveře + portál) a každá z nich je samostatná poptávka. Projdi poptávky jednu po druhé a porovnej jejich název, rozměry a počty s položkami v dokumentu; co v dokumentu najdeš, to do pole patří.
Pole nech prázdné **jen** když dokument nepokrývá žádnou poptávku ze seznamu. Pokrývá-li jedinou, vrať pole s jedním prvkem. Nikdy nevracej prázdné pole s odůvodněním, že poptávek je víc – v tom je právě smysl toho pole.
Vracej přesná id ze seznamu, ne názvy.
requestId: první z requestIds, tedy ta hlavní. Když je requestIds prázdné, vrať null.
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
 * Zařazení podle stejnojmenného štítku z Gmailu (#41). Uživatel přetáhne
 * e-mail pod štítek pojmenovaný jako projekt **nebo jako složka uvnitř
 * projektu** („Garáž" pod projektem „Dům") a tím určí zařazení sám –
 * spolehlivěji než odhad z textu.
 *
 * Vrací i důvod, proč se zařazení neurčilo, ať je to vidět u zprávy:
 * žádný štítek nesedí, nebo jich sedí víc a není jasné který.
 */
async function projectFromLabels(labels: string[] | undefined, ownerId: string) {
  const prazdne = { projectId: null as string | null, subProjectId: null as string | null, note: null as string | null };
  if (!labels?.length) return prazdne;

  const projects = await prisma.project.findMany({
    where: { ownerId },
    select: { id: true, name: true, subProjects: { select: { id: true, name: true } } },
  });

  type Hit = { projectId: string; subProjectId: string | null; label: string };
  const byKey = new Map<string, Hit>();
  for (const p of projects) {
    byKey.set(labelKey(p.name), { projectId: p.id, subProjectId: null, label: p.name });
    for (const sp of p.subProjects) {
      // Projekt téhož jména má přednost před složkou.
      const k = labelKey(sp.name);
      if (!byKey.has(k)) byKey.set(k, { projectId: p.id, subProjectId: sp.id, label: `${p.name} / ${sp.name}` });
    }
  }

  const hits = [...new Set(labels.map(labelKey))]
    .map((k) => byKey.get(k))
    .filter((h): h is Hit => !!h);
  // Dva štítky mířící do stejného místa nejsou spor.
  const unikatni = [...new Map(hits.map((h) => [`${h.projectId}:${h.subProjectId ?? ""}`, h])).values()];

  if (unikatni.length === 1) {
    const h = unikatni[0];
    return { projectId: h.projectId, subProjectId: h.subProjectId, note: `Zařazeno podle štítku „${h.label}".` };
  }
  if (unikatni.length > 1)
    return {
      ...prazdne,
      note: `Štítky míří na víc míst (${unikatni.map((h) => h.label).join(", ")}) – vyber zařazení ručně.`,
    };
  return prazdne;
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
async function routingContext(ownerId: string, forced?: { projectId?: string | null; subProjectId?: string | null }) {
  const onlyProjectId = forced?.projectId ?? null;
  const onlySubProjectId = forced?.subProjectId ?? null;
  const projects = await prisma.project.findMany({
    where: { ownerId, ...(onlyProjectId ? { id: onlyProjectId } : {}) },
    select: {
      id: true,
      name: true,
      requests: {
        where: {
          status: { notIn: ["schvaleno", "zruseno"] },
          ...(onlySubProjectId ? { subProjectId: onlySubProjectId } : {}),
        },
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
export async function suggestRouting(
  mail: FetchedMail,
  ownerId: string,
  forced?: { projectId: string | null; subProjectId: string | null },
): Promise<MailSuggestion | null> {
  let ctx = await routingContext(ownerId, forced);
  // Složka bez otevřených poptávek by modelu nedala na výběr nic – pak se
  // radši ptáme v rámci celého projektu.
  if (forced?.subProjectId && ctx.every((p) => p.poptavky.length === 0))
    ctx = await routingContext(ownerId, { projectId: forced.projectId });
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
            (forced?.projectId
              ? "Projekt (a případně složka) je už určený štítkem v e-mailu – vrať jeho projectId a soustřeď se na to, které **všechny** poptávky dokument pokrývá.\n"
              : "") +
            `Projekty a otevřené poptávky:\n${JSON.stringify(ctx, null, 1)}\n\n` +
            `E-mail\nOd: ${mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress}\n` +
            `Předmět: ${mail.subject}\n` +
            `Přílohy: ${mail.attachments.map((a) => a.originalName).join(", ") || "žádné"}\n\n` +
            `Text:\n${(mail.bodyText ?? "").slice(0, 6000)}`,
        },
      ],
      "mail-routing",
      ROUTE_SCHEMA,
      { effort: "medium", maxOutput: 3_000 },
    );
    // Vymyšlená id zahodit – radši bez návrhu než špatně zařazené.
    const project = ctx.find((p) => p.projectId === data.projectId) ?? null;
    const znama = new Set((project?.poptavky ?? ctx.flatMap((p) => p.poptavky)).map((r) => r.requestId));
    const request = data.requestId && znama.has(data.requestId) ? data.requestId : null;
    const requestIds = [...new Set([...(data.requestIds ?? []), ...(request ? [request] : [])])].filter((id) =>
      znama.has(id),
    );
    return {
      ...data,
      projectId: project?.projectId ?? null,
      requestId: request ?? requestIds[0] ?? null,
      requestIds,
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
    const suggestion = await suggestRouting(mail, owner.ownerId, fromLabel);
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
        subProjectId: fromLabel.subProjectId,
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

    // Do zvonečku; e-mailem chodí souhrn po každém vybrání, proto tady ne.
    await notifyUsers([owner.ownerId], {
      kind: "mail_received",
      title: `Nová pošta: ${mail.subject.slice(0, 120)}`,
      body: [
        `Od ${mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress}`,
        mail.attachments.length ? `Příloh: ${mail.attachments.length}` : "Bez příloh",
        fromLabel.note,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/posta",
      projectId: fromLabel.projectId ?? suggestion?.projectId ?? null,
      dedupeKey: `mail:${row.id}`,
      email: false,
    });

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
