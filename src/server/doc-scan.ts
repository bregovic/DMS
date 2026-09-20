import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { AI_MODEL, assertBudget, callModel, extractable, filePart } from "@/server/extraction";
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
};
export type ScanResult = {
  docType: "receipt" | "invoice" | "proforma" | "credit_note" | "other";
  supplier: { name: string | null; ico: string | null; dic: string | null; address: string | null };
  customer: { name: string | null; ico: string | null; dic: string | null };
  number: string | null;
  issueDate: string | null; // YYYY-MM-DD
  taxDate: string | null; // DUZP
  dueDate: string | null;
  currency: string;
  total: number | null;
  totalBase: number | null;
  totalVat: number | null;
  vatBreakdown: ScanVatRow[];
  reverseCharge: boolean;
  paymentMethod: string | null;
  variableSymbol: string | null;
  category: string | null;
  title: string | null;
  summary: string;
  items: ScanItem[];
  warnings: string[];
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
  supplier: obj({ name: str, ico: str, dic: str, address: str }),
  customer: obj({ name: str, ico: str, dic: str }),
  number: str,
  issueDate: str,
  taxDate: str,
  dueDate: str,
  currency: { type: "string" },
  total: n,
  totalBase: n,
  totalVat: n,
  vatBreakdown: { type: "array", items: obj({ rate: { type: "number" }, base: { type: "number" }, vat: { type: "number" } }) },
  reverseCharge: { type: "boolean" },
  paymentMethod: str,
  variableSymbol: str,
  category: str,
  title: str,
  summary: { type: "string" },
  items: {
    type: "array",
    items: obj({ description: { type: "string" }, quantity: n, unit: str, unitPrice: n, amount: { type: "number" }, vatRate: n }),
  },
  warnings: { type: "array", items: { type: "string" } },
});

const INSTRUCTIONS = `Jsi účetní. Ze snímku nebo PDF účtenky či faktury přečti údaje přesně tak, jak jsou na dokladu. Nic nedopočítávej odhadem.
- docType: receipt = účtenka/paragon, invoice = faktura (daňový doklad), proforma = zálohová faktura, credit_note = dobropis.
- supplier = kdo doklad vystavil (prodávající). ico = 8 číslic bez mezer, dic například CZ12345678. customer = odběratel, pokud je uveden.
- number = číslo dokladu, issueDate = datum vystavení, taxDate = DUZP (datum uskutečnění zdanitelného plnění; na účtence je to datum prodeje), dueDate = splatnost. Datumy ve formátu YYYY-MM-DD.
- total = celkem k úhradě s DPH, totalBase = základ celkem, totalVat = daň celkem.
- vatBreakdown = rozpis po sazbách přesně z rekapitulace dokladu (v ČR 21, 12 a 0 %). Když na dokladu rozpis není a doklad je bez DPH, vrať prázdné pole.
- reverseCharge = true u přenesené daňové povinnosti (režim PDP, „daň odvede zákazník").
- items = jednotlivé položky (popis, množství, MJ, jednotková cena bez DPH pokud je uvedená, částka za položku, sazba). U účtenky s mnoha položkami vrať nejvýš 40 nejdůležitějších.
- category = stručně, o jaký nákup jde (např. stavební materiál, palivo, elektronika, nářadí, služby).
- title = krátký název výdaje pro evidenci (dodavatel + co to je, max 60 znaků).
- summary = 1–2 věty, co doklad obsahuje. warnings = co je nečitelné nebo nejisté.
Čísla vracej jako čísla bez měny a bez mezer. Když údaj na dokladu není, vrať null.`;

/** Spustí vytěžení dokladu – návrh se uloží do DocScan (status ready | error). */
export async function runDocScan(scanId: string) {
  try {
    const scan = await prisma.docScan.findUnique({
      where: { id: scanId },
      select: { id: true, model: true, document: { select: { fileName: true, originalName: true, mimeType: true } } },
    });
    if (!scan) return;
    const doc = scan.document;
    if (!extractable(doc.mimeType, doc.originalName)) {
      await prisma.docScan.update({
        where: { id: scanId },
        data: { status: "error", error: "Tenhle typ souboru neumím přečíst (podporované jsou PDF a fotky)." },
      });
      return;
    }
    await assertBudget(); // limity zpracování až tady, ať je případná chyba vidět u dokladu
    const buf = await storage.read(doc.fileName);
    const { data, costUsd } = await callModel<ScanResult>(
      scan.model,
      INSTRUCTIONS,
      [await filePart(buf, doc.originalName, doc.mimeType), { type: "input_text", text: `Soubor: ${doc.originalName}` }],
      "doc-scan",
      SCHEMA,
      { effort: "low", maxOutput: 20_000 },
    );
    await prisma.docScan.update({
      where: { id: scanId },
      data: { status: "ready", result: normalize(data) as unknown as Prisma.InputJsonValue, costUsd },
    });
  } catch (err) {
    await prisma.docScan
      .update({
        where: { id: scanId },
        data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" },
      })
      .catch(() => {});
  }
}

/** Doplní chybějící součty a pohlídá, že rozpis DPH sedí na celek. */
export function normalize(d: ScanResult): ScanResult {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  d.currency = (d.currency || "CZK").toUpperCase().slice(0, 3);
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
  }));
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
