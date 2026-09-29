import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { AI_MODEL, assertBudget, callModel, extractable, filePart } from "@/server/extraction";
import { currencyCode } from "@/lib/utils";
import { getExpenseCategories } from "@/server/expense-categories";
import { Prisma } from "@/generated/prisma/client";

/**
 * Vytěžení účtenky / faktury z přílohy projektu (#doklady).
 *
 * Z nahraného souboru přečte dodavatele (IČO se ověří v ARESu), číslo dokladu,
 * datumy včetně DUZP, rozpis DPH po sazbách, položky a účel. Nic se nezakládá
 * samo – vznikne návrh (DocScan), který uživatel potvrdí a teprve tím vznikne
 * výdaj s položkami. Položky slouží i k porovnání cen s katalogem.
 */

export type ScanVatRow = { rate: number; base: number; vat: number };
export type ScanItem = {
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number;
  vatRate: number | null;
  /** Klíč kategorie z číselníku, nebo null když nic nesedí. */
  category: string | null;
  /** Návrh, jestli položka patří do přiznání (osobní spotřeba ne). */
  deductible: boolean;
};
export type ScanResult = {
  docType: "receipt" | "invoice" | "proforma" | "credit_note" | "other";
  supplier: { name: string | null; ico: string | null; dic: string | null; address: string | null; bankAccount: string | null };
  customer: { name: string | null; ico: string | null; dic: string | null };
  number: string | null;
  issueDate: string | null; // YYYY-MM-DD
  taxDate: string | null; // DUZP
  dueDate: string | null;
  currency: string;
  /** Kurz CZK za 1 jednotku měny (jen u cizí měny). */
  exchangeRate: number | null;
  /** Celkem v CZK, pokud je na dokladu uvedeno. */
  totalCzk: number | null;
  /** Odkud je kurz – z dokladu, nebo z kurzovního lístku ČNB. */
  rateNote?: string | null;
  total: number | null;
  totalBase: number | null;
  totalVat: number | null;
  vatBreakdown: ScanVatRow[];
  reverseCharge: boolean;
  paymentMethod: string | null;
  variableSymbol: string | null;
  category: string | null;
  /** Název kategorie k založení, když doklad nesedí do žádné existující. */
  newCategory: string | null;
  title: string | null;
  summary: string;
  items: ScanItem[];
  warnings: string[];
  /** Co ten soubor je: doklad k zaúčtování, nabídka na žádanku, nebo nic z toho. */
  docKind: "doklad" | "nabidka" | "ostatni";
  /** Kód místa ze seznamu v pokynu (projekt nebo složka); mapuje se zpět na id. */
  placeCode: string | null;
  /** Kódy žádanek, které nabídka pokrývá. */
  requestCodes: string[];
  /** Čím je zařazení podložené – ať je vidět, proč to tam chce dát. */
  placeReason: string | null;
  /** Doplní server po převodu kódů na identifikátory. */
  projectId?: string | null;
  subProjectId?: string | null;
  requestIds?: string[];
};

const n = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const SCHEMA = obj({
  docType: { type: "string", enum: ["receipt", "invoice", "proforma", "credit_note", "other"] },
  supplier: obj({ name: str, ico: str, dic: str, address: str, bankAccount: str }),
  customer: obj({ name: str, ico: str, dic: str }),
  number: str,
  issueDate: str,
  taxDate: str,
  dueDate: str,
  currency: { type: "string" },
  exchangeRate: n,
  totalCzk: n,
  total: n,
  totalBase: n,
  totalVat: n,
  vatBreakdown: { type: "array", items: obj({ rate: { type: "number" }, base: { type: "number" }, vat: { type: "number" } }) },
  reverseCharge: { type: "boolean" },
  paymentMethod: str,
  variableSymbol: str,
  category: str,
  newCategory: str,
  title: str,
  summary: { type: "string" },
  items: {
    type: "array",
    items: obj({
      description: { type: "string" },
      quantity: n,
      unit: str,
      unitPrice: n,
      amount: { type: "number" },
      vatRate: n,
      category: str,
      deductible: { type: "boolean" },
    }),
  },
  warnings: { type: "array", items: { type: "string" } },
  docKind: { type: "string", enum: ["doklad", "nabidka", "ostatni"] },
  placeCode: str,
  requestCodes: { type: "array", items: { type: "string" } },
  placeReason: str,
});

export type Misto = { kod: string; nazev: string; projectId: string; subProjectId: string | null };
export type ZadankaVolba = { kod: string; nazev: string; misto: string; id: string };

const INSTRUCTIONS = (
  cats: { key: string; label: string }[],
  mista: Misto[],
  zadanky: ZadankaVolba[],
  kontext: string,
) => `Jsi účetní. Ze snímku nebo PDF přečti údaje přesně tak, jak jsou v dokumentu. Nic nedopočítávej odhadem.
- docType: receipt = účtenka/paragon, invoice = faktura (daňový doklad), proforma = zálohová faktura, credit_note = dobropis.
- supplier = kdo doklad vystavil (prodávající). ico = 8 číslic bez mezer, dic například CZ12345678. customer = odběratel, pokud je uveden.
- supplier.bankAccount = číslo účtu (123456789/0100) nebo IBAN, na který se platí – bývá v hlavičce, v patičce nebo u platebních údajů. Když na dokladu není, vrať null.
- number = číslo dokladu, issueDate = datum vystavení, taxDate = DUZP (datum uskutečnění zdanitelného plnění; na účtence je to datum prodeje), dueDate = splatnost. Datumy ve formátu YYYY-MM-DD.
- total = celkem k úhradě s DPH, totalBase = základ celkem, totalVat = daň celkem – v měně dokladu.
- currency = měna dokladu (CZK, EUR, USD…). Je-li doklad v cizí měně: exchangeRate = kurz uvedený na dokladu (kolik Kč za 1 jednotku měny), totalCzk = celková částka v Kč, pokud ji doklad uvádí (u českých dokladů v EUR bývá rekapitulace DPH i v Kč). Když kurz ani částka v Kč na dokladu nejsou, vrať null.
- vatBreakdown = rozpis po sazbách přesně z rekapitulace dokladu (v ČR 21, 12 a 0 %). Když na dokladu rozpis není a doklad je bez DPH, vrať prázdné pole.
- reverseCharge = true u přenesené daňové povinnosti (režim PDP, „daň odvede zákazník").
- items = jednotlivé položky (popis, množství, MJ, jednotková cena bez DPH pokud je uvedená, částka za položku, sazba). U účtenky s mnoha položkami vrať nejvýš 40 nejdůležitějších.
- category = klíč kategorie nákupu ze seznamu níž. Vyber ten, který sedí nejlíp; když nesedí žádný, vrať null a do newCategory dej krátký název kategorie, která chybí (1–2 slova, prvním písmenem velkým).
- U každé položky taky category = klíč ze stejného seznamu (doklad běžně míchá víc druhů nákupu, třeba palivo a občerstvení).
- deductible u položky = patří do nároku na odpočet DPH? Vrať false jen u zjevně osobní spotřeby: jídlo, pití, občerstvení, cukrovinky, tabák, léky a drogerie pro osobní potřebu. U všeho ostatního true.
- title = krátký název výdaje pro evidenci (dodavatel + co to je, max 60 znaků).
- summary = 1–2 věty, co dokument obsahuje. warnings = co je nečitelné nebo nejisté.
- docKind = co ten soubor je. "doklad" = faktura, účtenka nebo dobropis k zaúčtování. "nabidka" = cenová nabídka nebo ceník, ještě se neplatí. "ostatni" = technický list, katalog, leták, smlouva.
- placeCode = kód místa ze seznamu níž, kam dokument patří. Když to z obsahu nejde poznat, vrať null; nehádej.
- requestCodes = u nabídky kódy VŠECH žádanek, které nabídka naceňuje – nabídka běžně pokrývá víc žádanek naráz. U dokladu vrať prázdné pole.
- placeReason = jednou větou, čím je zařazení podložené (co v dokumentu na to místo nebo žádanku ukazuje).
Čísla vracej jako čísla bez měny a bez mezer. Když údaj v dokumentu není, vrať null.

Kategorie (klíč = název):
${cats.map((c) => `${c.key} = ${c.label}`).join("\n")}

Místa (kód = název):
${mista.map((m) => `${m.kod} = ${m.nazev}`).join("\n") || "(žádná)"}

Otevřené žádanky (kód = název · místo):
${zadanky.map((z) => `${z.kod} = ${z.nazev} · ${z.misto}`).join("\n") || "(žádné)"}
${kontext}`;

/**
 * Postgres neuloží do JSON ani do textu znak \u0000 (a osamělé půlky surrogate
 * páru) – když je model vrátí v přepisu dokladu, spadlo by celé uložení.
 */
function stripNul<T>(v: T): T {
  if (typeof v === "string")
    return v
      .replace(/\u0000/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
      .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, "$1") as T;
  if (Array.isArray(v)) return v.map((x) => stripNul(x)) as T;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = stripNul(o[k]);
    return v;
  }
  return v;
}

/**
 * Místa a otevřené žádanky, ze kterých si čtení vybírá.
 *
 * Do pokynu jdou krátké kódy (m1, r3), ne identifikátory z databáze – model
 * by je jinak skládal podle podoby a vracel neexistující. Kód se pak převede
 * zpátky; co v seznamu není, se zahodí.
 */
async function volbyZarazeni(ownerId: string | null) {
  if (!ownerId) return { mista: [] as Misto[], zadanky: [] as ZadankaVolba[] };
  const projekty = await prisma.project.findMany({
    where: { ownerId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, subProjects: { select: { id: true, name: true, parentId: true } } },
  });
  const mista: Misto[] = [];
  const podleId = new Map<string, string>(); // subProjectId → název místa
  for (const p of projekty) {
    mista.push({ kod: `m${mista.length + 1}`, nazev: p.name, projectId: p.id, subProjectId: null });
    const cesta = (sid: string): string => {
      const sub = p.subProjects.find((x) => x.id === sid);
      if (!sub) return p.name;
      return sub.parentId ? `${cesta(sub.parentId)} › ${sub.name}` : `${p.name} › ${sub.name}`;
    };
    for (const sub of p.subProjects) {
      const nazev = cesta(sub.id);
      podleId.set(sub.id, nazev);
      mista.push({ kod: `m${mista.length + 1}`, nazev, projectId: p.id, subProjectId: sub.id });
    }
  }

  const rq = await prisma.request.findMany({
    where: { project: { ownerId }, status: { notIn: ["zruseno", "objednano", "dokonceno"] } },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: { id: true, title: true, subProjectId: true, project: { select: { name: true } } },
  });
  const zadanky: ZadankaVolba[] = rq.map((r, i) => ({
    kod: `r${i + 1}`,
    nazev: r.title.slice(0, 120),
    misto: r.subProjectId ? (podleId.get(r.subProjectId) ?? r.project.name) : r.project.name,
    id: r.id,
  }));
  return { mista, zadanky };
}

/** Kódy z odpovědi zpět na identifikátory; neznámé se zahodí. */
function prelozZarazeni(d: ScanResult, mista: Misto[], zadanky: ZadankaVolba[]): ScanResult {
  const misto = mista.find((m) => m.kod === d.placeCode);
  d.projectId = misto?.projectId ?? null;
  d.subProjectId = misto?.subProjectId ?? null;
  const kody = new Set((d.requestCodes ?? []).map(String));
  d.requestIds = zadanky.filter((z) => kody.has(z.kod)).map((z) => z.id);
  // Žádanka určuje místo přesněji než odhad – když je vybraná, řídí se jí.
  if (d.requestIds.length && !misto) {
    const prvni = rq_misto(zadanky, d.requestIds[0], mista);
    if (prvni) {
      d.projectId = prvni.projectId;
      d.subProjectId = prvni.subProjectId;
    }
  }
  return d;
}

function rq_misto(zadanky: ZadankaVolba[], requestId: string, mista: Misto[]) {
  const z = zadanky.find((x) => x.id === requestId);
  return z ? mista.find((m) => m.nazev === z.misto) : undefined;
}

/** Spustí vytěžení dokladu – návrh se uloží do DocScan (status ready | error). */
export async function runDocScan(scanId: string) {
  try {
    const scan = await prisma.docScan.findUnique({
      where: { id: scanId },
      select: {
        id: true,
        model: true,
        document: { select: { fileName: true, originalName: true, mimeType: true, project: { select: { ownerId: true } } } },
        inboundAttachment: {
          select: {
            fileName: true,
            originalName: true,
            mimeType: true,
            mail: { select: { subject: true, bodyText: true, fromName: true, fromAddress: true, ownerId: true } },
          },
        },
      },
    });
    if (!scan) return;
    const doc = scan.document ?? scan.inboundAttachment;
    if (!doc) return;
    if (!extractable(doc.mimeType, doc.originalName)) {
      await prisma.docScan.update({
        where: { id: scanId },
        data: { status: "error", error: "Tenhle typ souboru neumím přečíst (podporované jsou PDF a fotky)." },
      });
      return;
    }
    await assertBudget(); // limity zpracování až tady, ať je případná chyba vidět u dokladu
    const cats = await getExpenseCategories();
    const ownerId = scan.document?.project.ownerId ?? scan.inboundAttachment?.mail.ownerId ?? null;
    const { mista, zadanky } = await volbyZarazeni(ownerId);
    // U pošty jde do promptu i hlavička zprávy – u přeposlané nabídky bývá
    // dodavatel jen tam a v textu, ne v příloze.
    const m = scan.inboundAttachment?.mail;
    const kontext = m
      ? `\nE-mail, kterým dokument přišel:\nOd: ${m.fromName ?? ""} <${m.fromAddress}>\nPředmět: ${m.subject}\n${(m.bodyText ?? "").slice(0, 4000)}`
      : "";
    const buf = await storage.read(doc.fileName);
    const { data, costUsd } = await callModel<ScanResult>(
      scan.model,
      INSTRUCTIONS(cats, mista, zadanky, kontext),
      [await filePart(buf, doc.originalName, doc.mimeType), { type: "input_text", text: `Soubor: ${doc.originalName}` }],
      "doc-scan",
      SCHEMA,
      { effort: "low", maxOutput: 20_000 },
    );
    const result = await fillExchangeRate(
      prelozZarazeni(normalize(stripNul(data), new Set(cats.map((c) => c.key))), mista, zadanky),
    );
    const scanRow = await prisma.docScan.update({
      where: { id: scanId },
      data: { status: "ready", result: result as unknown as Prisma.InputJsonValue, costUsd },
      select: { documentId: true, projectId: true, createdById: true },
    });

    // typ přílohy podle toho, co doklad opravdu je (účtenka × faktura)
    const docType =
      result.docType === "invoice" || result.docType === "proforma" || result.docType === "credit_note"
        ? "invoice"
        : result.docType === "receipt"
          ? "receipt"
          : null;
    if (docType && scanRow.documentId)
      await prisma.document.update({ where: { id: scanRow.documentId }, data: { type: docType } });

    // Správci projektu: doklad je přečtený a čeká na zaúčtování. U pošty
    // projekt ještě není, takže není komu hlásit – zpráva přijde po zařazení.
    const project = scanRow.projectId
      ? await prisma.project.findUnique({
          where: { id: scanRow.projectId },
          select: { name: true, ownerId: true, memberships: { where: { role: "member" }, select: { email: true } } },
        })
      : null;
    if (project) {
      const emails = project.memberships.map((m) => m.email);
      const members = emails.length
        ? await prisma.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true } })
        : [];
      const { notifyUsers } = await import("@/server/notify");
      await notifyUsers([project.ownerId, ...members.map((m) => m.id)], {
        kind: "doc_scan_ready",
        title: `Doklad ke kontrole: ${result.supplier?.name ?? "doklad"}${result.total != null ? ` – ${Math.round(result.total).toLocaleString("cs-CZ")} Kč` : ""}`,
        body: project.name,
        href: "/doklady",
        projectId: scanRow.projectId,
        dedupeKey: `docscan:${scanId}`,
      });
    }
  } catch (err) {
    await prisma.docScan
      .update({
        where: { id: scanId },
        data: { status: "error", error: stripNul(err instanceof Error ? err.message : "Neznámá chyba").slice(0, 500) },
      })
      .catch(() => {});
  }
}

/** Doplní chybějící součty a pohlídá, že rozpis DPH sedí na celek. */
export function normalize(d: ScanResult, catKeys?: Set<string>): ScanResult {
  // Model občas vrátí popisek místo klíče ("Palivo") nebo klíč, který neexistuje.
  const cat = (v: unknown) => {
    const k = String(v ?? "").trim();
    if (!k) return null;
    if (!catKeys) return k.slice(0, 40);
    return catKeys.has(k) ? k : null;
  };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  d.currency = currencyCode(d.currency);
  d.exchangeRate = num(d.exchangeRate);
  d.totalCzk = num(d.totalCzk);
  d.supplier.ico = d.supplier.ico?.replace(/\D/g, "").slice(0, 8) || null;
  d.supplier.dic = d.supplier.dic?.replace(/\s/g, "").toUpperCase() || null;
  d.vatBreakdown = (d.vatBreakdown ?? [])
    .map((r) => ({ rate: Number(r.rate) || 0, base: num(r.base) ?? 0, vat: num(r.vat) ?? 0 }))
    .filter((r) => r.base || r.vat);
  const sumBase = d.vatBreakdown.reduce((a, r) => a + r.base, 0);
  const sumVat = d.vatBreakdown.reduce((a, r) => a + r.vat, 0);
  d.totalBase = num(d.totalBase) ?? (sumBase || null);
  d.totalVat = num(d.totalVat) ?? (sumVat || null);
  d.total = num(d.total) ?? ((d.totalBase ?? 0) + (d.totalVat ?? 0) || null);
  d.items = (d.items ?? []).slice(0, 60).map((i) => ({
    description: String(i.description ?? "").slice(0, 300),
    quantity: num(i.quantity),
    unit: i.unit?.slice(0, 20) ?? null,
    unitPrice: num(i.unitPrice),
    amount: num(i.amount) ?? 0,
    vatRate: num(i.vatRate),
    category: cat(i.category),
    deductible: i.deductible !== false,
  }));
  d.category = cat(d.category);
  d.newCategory = String(d.newCategory ?? "").trim().slice(0, 40) || null;
  // Kategorie z položek, když ji doklad jako celek neurčil: která má největší podíl.
  if (!d.category) {
    const podle = new Map<string, number>();
    for (const i of d.items) if (i.category) podle.set(i.category, (podle.get(i.category) ?? 0) + Math.abs(i.amount));
    d.category = [...podle.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  d.warnings = d.warnings ?? [];
  if (d.total != null && d.vatBreakdown.length) {
    const diff = Math.abs(d.total - (sumBase + sumVat));
    if (diff > Math.max(1, d.total * 0.02)) d.warnings.push("Rozpis DPH nesedí na celkovou částku – zkontroluj údaje.");
  }
  const itemSum = d.items.reduce((a, i) => a + (i.amount || 0), 0);
  if (d.total != null && itemSum > 0 && Math.abs(itemSum - d.total) > Math.max(1, d.total * 0.15) && Math.abs(itemSum - (d.totalBase ?? 0)) > Math.max(1, d.total * 0.15))
    d.warnings.push("Součet položek neodpovídá celkové částce – položky můžou být neúplné.");
  return d;
}

/**
 * Kurz ČNB k datu (Kč za jednotku měny). Kurzovní lístek vychází jen
 * v pracovní dny, tak se zkouší i pár dní zpět.
 */
export async function cnbRate(currency: string, day: Date): Promise<{ rate: number; date: string } | null> {
  const code = currency.toUpperCase();
  if (!code || code === "CZK") return null;
  for (let back = 0; back < 6; back++) {
    const d = new Date(day.getTime() - back * 86400000).toISOString().slice(0, 10);
    try {
      const res = await fetch(`https://api.cnb.cz/cnbapi/exrates/daily?date=${d}&lang=CZ`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { rates?: { currencyCode?: string; rate?: number; amount?: number; validFor?: string }[] };
      const row = j.rates?.find((r) => r.currencyCode?.toUpperCase() === code);
      if (row?.rate) return { rate: row.rate / (row.amount || 1), date: row.validFor ?? d };
    } catch {
      // síť nevyšla – zkusíme starší den
    }
  }
  return null;
}

/** Doplní kurz k cizí měně: přednost má doklad, pak kurzovní lístek ČNB. */
export async function fillExchangeRate(d: ScanResult): Promise<ScanResult> {
  if (currencyCode(d.currency) === "CZK") return d;
  if (d.exchangeRate) {
    d.rateNote = "kurz z dokladu";
    return d;
  }
  if (d.totalCzk && d.total) {
    d.exchangeRate = Math.round((d.totalCzk / d.total) * 10000) / 10000;
    d.rateNote = "dopočteno z částky v Kč na dokladu";
    return d;
  }
  const day = new Date(d.taxDate ?? d.issueDate ?? new Date().toISOString().slice(0, 10));
  const cnb = await cnbRate(d.currency, isNaN(day.getTime()) ? new Date() : day);
  if (cnb) {
    d.exchangeRate = cnb.rate;
    d.rateNote = `kurz ČNB ${new Date(cnb.date).toLocaleDateString("cs-CZ")}`;
    if (d.total != null) d.totalCzk = Math.round(d.total * cnb.rate * 100) / 100;
  }
  return d;
}

/** Založí návrh a rovnou ho spustí (volá se po nahrání účtenky/faktury). */
export async function createDocScan(projectId: string, documentId: string, userId: string) {
  const scan = await prisma.docScan.upsert({
    where: { documentId },
    update: { status: "running", result: Prisma.JsonNull, error: null, model: AI_MODEL, createdById: userId },
    create: { projectId, documentId, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return scan.id;
}

/** Čtení přílohy z pošty – projekt se určí až z obsahu, dokument vznikne potvrzením. */
export async function createMailScan(inboundAttachmentId: string, userId: string) {
  const scan = await prisma.docScan.upsert({
    where: { inboundAttachmentId },
    update: { status: "running", result: Prisma.JsonNull, error: null, model: AI_MODEL, createdById: userId },
    create: { inboundAttachmentId, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return scan.id;
}
/** ARES: dohledá firmu podle IČO (název, DIČ, adresa). */
export async function fetchAres(ico: string) {
  const clean = ico.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${clean}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      obchodniJmeno?: string;
      dic?: string;
      sidlo?: { textovaAdresa?: string };
    };
    return {
      name: j.obchodniJmeno ?? null,
      dic: j.dic ?? null,
      address: j.sidlo?.textovaAdresa ?? null,
    };
  } catch {
    return null;
  }
}
