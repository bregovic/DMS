import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";

/**
 * AI nad přílohami žádanek (#33).
 *
 * 1) Vytěžení: z nabídky (PDF, foto, Word, Excel, e-mail, text) vytáhne
 *    dodavatele, ceny a podmínky a rozdělí je mezi otevřené žádanky projektu
 *    – nabídka na okna, dveře i portál se rozpadne na tři části. U technického
 *    dokumentu vytáhne technické údaje. Ke každé části navrhne úkoly do plánu
 *    (objednat, zaměření, výroba/dodání, montáž), které se založí po výběru
 *    nabídky. Výsledek je jen návrh (Extraction.result) k potvrzení.
 * 2) Porovnání: stručný report pro výběr nabídky u žádanky podle pokynu.
 *
 * Klíč OPENAI_API_KEY (stejný účet jako Karacho). Model AI_MODEL, výchozí
 * gpt-5-mini – nabídka stojí zhruba 0,01 USD. Měsíční strop AI_MONTHLY_LIMIT_USD
 * (výchozí 5 USD) hlídá součet costUsd vytěžení i porovnání za kalendářní měsíc.
 */

export const AI_MODEL = process.env.AI_MODEL || "gpt-5-mini";
const MONTHLY_LIMIT_USD = Number(process.env.AI_MONTHLY_LIMIT_USD || 5);
// USD za 1M tokenů (vstup, výstup) – pro odhad útraty.
const PRICES: Record<string, [number, number]> = {
  "gpt-5-mini": [0.25, 2],
  "gpt-5": [1.25, 10],
  "gpt-5-nano": [0.05, 0.4],
  "gpt-4.1-mini": [0.4, 1.6],
};
const MAX_TEXT = 60_000; // znaků textu z dokumentu do modelu

export type PlanTaskDraft = { title: string; days: number; kind: "order" | "wait" | "work" };
export type ExtractedPart = {
  requestId: string | null;
  label: string;
  items: string[];
  priceWithoutVat: number | null;
  priceWithVat: number | null;
  leadTime: string | null;
  note: string | null;
  tasks: PlanTaskDraft[];
};
export type ExtractionResult = {
  documentKind: "offer" | "technical" | "other";
  vendor: {
    name: string | null;
    ico: string | null;
    dic: string | null;
    email: string | null;
    phone: string | null;
    web: string | null;
    address: string | null;
    contactPerson: string | null;
  };
  offerNumber: string | null;
  offerDate: string | null;
  validUntil: string | null;
  totalWithoutVat: number | null;
  totalWithVat: number | null;
  parts: ExtractedPart[];
  technicalSpecs: string[];
  summary: string;
  warnings: string[];
};
export type ComparisonResult = {
  headline: string;
  columns: string[];
  rows: { offer: string; cells: string[] }[];
  pros: { offer: string; pros: string[]; cons: string[] }[];
  recommendation: string;
  questions: string[];
};

const n = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const strArr = { type: "array", items: { type: "string" } };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const EXTRACT_SCHEMA = obj({
  documentKind: { type: "string", enum: ["offer", "technical", "other"] },
  vendor: obj({ name: str, ico: str, dic: str, email: str, phone: str, web: str, address: str, contactPerson: str }),
  offerNumber: str,
  offerDate: str,
  validUntil: str,
  totalWithoutVat: n,
  totalWithVat: n,
  parts: {
    type: "array",
    items: obj({
      requestId: str,
      label: { type: "string" },
      items: strArr,
      priceWithoutVat: n,
      priceWithVat: n,
      leadTime: str,
      note: str,
      tasks: {
        type: "array",
        items: obj({ title: { type: "string" }, days: { type: "number" }, kind: { type: "string", enum: ["order", "wait", "work"] } }),
      },
    }),
  },
  technicalSpecs: strArr,
  summary: { type: "string" },
  warnings: strArr,
});

const COMPARE_SCHEMA = obj({
  headline: { type: "string" },
  columns: strArr,
  rows: { type: "array", items: obj({ offer: { type: "string" }, cells: strArr }) },
  pros: { type: "array", items: obj({ offer: { type: "string" }, pros: strArr, cons: strArr }) },
  recommendation: { type: "string" },
  questions: strArr,
});

const EXTRACT_INSTRUCTIONS = `Jsi asistent stavebníka. Z přiloženého dokumentu vytěž co nejvíc užitečného.
documentKind: "offer" = cenová nabídka, "technical" = technický list / výkres / specifikace bez cen, "other" = ostatní.
U nabídky rozděl položky na části:
- jedna část = jedna poptávka ze seznamu (requestId); položky patřící ke stejné poptávce sečti do jedné části a vypiš je v items (stručně, s rozměry a počtem),
- podíl společných položek (doprava, montáž, zaměření, demontáž) rozpočítej do částí poměrem cen a zmiň to v note,
- co nepasuje k žádné poptávce, dej jako část s requestId null; poptávky, které dokument vůbec nepokrývá, nevracej.
Ke každé části navrhni tasks = úkoly do stavebního plánu po výběru této nabídky, v pořadí, jak jdou po sobě:
kind "order" (objednat/zálohovat, 1 den), "work" (práce na stavbě: zaměření, montáž, zapravení – odhad dní podle rozsahu), "wait" (výroba/dodací lhůta – dny podle nabídky, např. 6–12 týdnů = 63). Názvy krátce česky, např. "Objednat okna – Macek", "Zaměření oken", "Výroba a dodání oken", "Montáž oken".
U technického dokumentu nech parts prázdné a do technicalSpecs dej klíčové parametry (rozměry, U-hodnoty, materiály, barvy, požadavky na stavební připravenost).
Ceny jako čísla v Kč (bez mezer), data YYYY-MM-DD, leadTime textem (např. "6–12 týdnů").
summary česky 2–4 věty: co dokument obsahuje, co je v ceně a co ne, záruky, platnost.
warnings: rozpory se specifikací poptávky, chybějící montáž/doprava, krátká platnost, nejasnosti.
Pokyn uživatele (pokud je) má přednost.`;

const COMPARE_INSTRUCTIONS = `Jsi nezávislý poradce stavebníka. Porovnej nabídky k jedné poptávce a připrav stručný, přehledný podklad pro výběr, česky.
columns: 4–7 nejdůležitějších srovnávacích hledisek (vždy "Cena s DPH" a "Dodání"; dál podle poptávky a pokynu – např. profil, Uw/Ug, záruka, montáž v ceně, co chybí).
rows: jeden řádek na nabídku, offer = název dodavatele, cells ve stejném pořadí jako columns, krátce (max ~6 slov), neznámé = "?".
pros: u každé nabídky 1–3 plusy a 1–3 minusy.
recommendation: 2–3 věty, kterou vybrat a proč; když se nedá rozhodnout, co chybí.
questions: co si ověřit u dodavatelů před objednáním (max 5).
headline: jedna věta shrnutí. Pokyn uživatele má přednost (co je pro něj důležité).`;

/** Útrata za AI v aktuálním měsíci (USD). */
export async function monthlyAiSpend() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [a, b] = await Promise.all([
    prisma.extraction.aggregate({ where: { createdAt: { gte: start } }, _sum: { costUsd: true } }),
    prisma.offerComparison.aggregate({ where: { createdAt: { gte: start } }, _sum: { costUsd: true } }),
  ]);
  return (a._sum.costUsd ?? 0) + (b._sum.costUsd ?? 0);
}

async function assertBudget() {
  if (!process.env.OPENAI_API_KEY) throw new Error("AI není nastavená (chybí OPENAI_API_KEY).");
  if ((await monthlyAiSpend()) >= MONTHLY_LIMIT_USD)
    throw new Error(`Měsíční limit pro AI (${MONTHLY_LIMIT_USD} USD) je vyčerpaný.`);
}

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const TEXT_EXT = ["doc", "docx", "xlsx", "eml", "txt", "csv", "md", "html", "htm", "rtf"];

/** Umí AI soubor přečíst? PDF, obrázky, Word, Excel (.xlsx), e-maily a text. */
export function extractable(mimeType: string, name: string) {
  const e = ext(name);
  return (
    mimeType === "application/pdf" ||
    e === "pdf" ||
    (mimeType.startsWith("image/") && !mimeType.includes("svg")) ||
    TEXT_EXT.includes(e)
  );
}

/** Obsah souboru pro model: PDF / obrázek přímo, ostatní jako text. */
async function filePart(buf: Buffer, name: string, mimeType: string) {
  const e = ext(name);
  if (mimeType === "application/pdf" || e === "pdf")
    return { type: "input_file", filename: name, file_data: `data:application/pdf;base64,${buf.toString("base64")}` };
  if (mimeType.startsWith("image/"))
    return { type: "input_image", image_url: `data:${mimeType};base64,${buf.toString("base64")}` };

  let text: string;
  if (e === "doc" || e === "docx") {
    const WordExtractor = (await import("word-extractor")).default;
    const doc = await new WordExtractor().extract(buf);
    text = [doc.getHeaders?.({ includeFooters: true }), doc.getBody(), doc.getFootnotes?.(), doc.getTextboxes?.()]
      .filter(Boolean)
      .join("\n");
  } else if (e === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const out: string[] = [];
    wb.eachSheet((ws) => {
      out.push(`## List ${ws.name}`);
      ws.eachRow((row) => {
        const vals = (row.values as unknown[]).slice(1).map((v) => {
          if (v == null) return "";
          if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "");
          if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "");
          return String(v);
        });
        if (vals.some((x) => x.trim())) out.push(vals.join("\t"));
      });
    });
    text = out.join("\n");
  } else if (e === "eml") {
    // Přílohy v base64 jsou jen šum – z e-mailu stačí hlavička a text.
    text = buf
      .toString("utf8")
      .replace(/\n([A-Za-z0-9+/=]{60,}\r?\n)+/g, "\n[příloha vynechána]\n");
  } else {
    text = buf.toString("utf8");
  }
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("Z dokumentu se nepodařilo přečíst žádný text.");
  return {
    type: "input_text",
    text: `Obsah souboru „${name}“ (převedeno na text):\n\n${text.slice(0, MAX_TEXT)}${text.length > MAX_TEXT ? "\n[… zkráceno]" : ""}`,
  };
}

/** Jedno volání OpenAI se strukturovaným výstupem. */
async function callModel<T>(
  model: string,
  system: string,
  content: unknown[],
  name: string,
  schema: unknown,
): Promise<{ data: T; costUsd: number; inTok: number; outTok: number }> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(240_000),
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `OpenAI HTTP ${res.status}`);
  const text = j.output
    ?.find((o: { type: string }) => o.type === "message")
    ?.content?.find((c: { type: string }) => c.type === "output_text")?.text;
  if (!text) throw new Error("Model nevrátil výsledek.");
  const inTok = j.usage?.input_tokens ?? 0;
  const outTok = j.usage?.output_tokens ?? 0;
  const [pin, pout] = PRICES[model] ?? PRICES["gpt-5-mini"];
  return { data: JSON.parse(text) as T, costUsd: (inTok * pin + outTok * pout) / 1_000_000, inTok, outTok };
}

// ---------------------------------------------------------------------------
// Vytěžení
// ---------------------------------------------------------------------------

/** Založí záznam vytěžení a vrátí jeho id (běh spouští runExtraction). */
export async function createExtraction(documentId: string, userId: string, instructions?: string | null) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, projectId: true, requestId: true },
  });
  if (!doc?.requestId) throw new Error("Příloha nepatří k žádance.");
  await assertBudget();
  const ex = await prisma.extraction.create({
    data: {
      projectId: doc.projectId,
      requestId: doc.requestId,
      documentId: doc.id,
      model: AI_MODEL,
      instructions: instructions?.trim() || null,
      createdById: userId,
    },
    select: { id: true },
  });
  return ex.id;
}

/** Přečte přílohu, pošle ji modelu a uloží návrh. Chyby zapíše do záznamu. */
export async function runExtraction(extractionId: string) {
  try {
    const ex = await prisma.extraction.findUnique({
      where: { id: extractionId },
      select: {
        id: true,
        projectId: true,
        requestId: true,
        model: true,
        instructions: true,
        document: { select: { fileName: true, originalName: true, mimeType: true } },
      },
    });
    if (!ex) return;

    const requests = await prisma.request.findMany({
      where: { projectId: ex.projectId, status: { notIn: ["schvaleno", "zruseno"] } },
      select: { id: true, title: true, description: true, quantity: true, unit: true },
      orderBy: { createdAt: "asc" },
    });
    const reqList = requests.map((r) => ({
      requestId: r.id,
      title: r.title,
      specification: r.description,
      quantity: r.quantity != null ? `${Number(r.quantity)} ${r.unit}` : null,
      attachedHere: r.id === ex.requestId || undefined,
    }));

    const buf = await storage.read(ex.document.fileName);
    const part = await filePart(buf, ex.document.originalName, ex.document.mimeType);
    const { data: result, costUsd, inTok, outTok } = await callModel<ExtractionResult>(
      ex.model,
      EXTRACT_INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Otevřené poptávky projektu (attachedHere = dokument je přiložený u této):\n${JSON.stringify(reqList, null, 1)}` +
            (ex.instructions ? `\n\nPokyn uživatele: ${ex.instructions}` : ""),
        },
        part,
      ],
      "document",
      EXTRACT_SCHEMA,
    );
    // requestId, který model vymyslel, zahodit
    const known = new Set(requests.map((r) => r.id));
    for (const p of result.parts) if (p.requestId && !known.has(p.requestId)) p.requestId = null;

    await prisma.extraction.update({
      where: { id: ex.id },
      data: {
        status: "ready",
        result: result as unknown as Prisma.InputJsonValue,
        inputTokens: inTok,
        outputTokens: outTok,
        costUsd,
      },
    });
  } catch (err) {
    await prisma.extraction
      .update({
        where: { id: extractionId },
        data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" },
      })
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Porovnání nabídek
// ---------------------------------------------------------------------------

export async function createComparison(requestId: string, userId: string, prompt?: string | null) {
  const offers = await prisma.offer.count({ where: { requestId } });
  if (offers === 0) throw new Error("Žádanka zatím nemá žádnou nabídku.");
  await assertBudget();
  const c = await prisma.offerComparison.create({
    data: { requestId, prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return c.id;
}

export async function runComparison(comparisonId: string) {
  try {
    const c = await prisma.offerComparison.findUnique({
      where: { id: comparisonId },
      select: { id: true, requestId: true, prompt: true, model: true },
    });
    if (!c) return;
    const req = await prisma.request.findUnique({
      where: { id: c.requestId },
      select: {
        title: true,
        description: true,
        quantity: true,
        unit: true,
        requiredDate: true,
        offers: {
          select: {
            id: true,
            vendorName: true,
            vendor: { select: { name: true } },
            price: true,
            deliveryDate: true,
            note: true,
            rating: true,
            score: true,
            status: true,
            selected: true,
            extractionId: true,
            extractionPart: true,
          },
        },
      },
    });
    if (!req) return;

    // K nabídkám z AI přidat souhrn a upozornění z vytěžení.
    const exIds = [...new Set(req.offers.map((o) => o.extractionId).filter((x): x is string => !!x))];
    const exs = exIds.length
      ? await prisma.extraction.findMany({ where: { id: { in: exIds } }, select: { id: true, result: true } })
      : [];
    const exMap = new Map(exs.map((e) => [e.id, e.result as unknown as ExtractionResult | null]));

    const offers = req.offers.map((o) => {
      const r = o.extractionId ? exMap.get(o.extractionId) : null;
      const part = r && o.extractionPart != null ? r.parts[o.extractionPart] : null;
      return {
        vendor: o.vendor?.name ?? o.vendorName ?? "neznámý dodavatel",
        priceCzk: o.price != null ? Number(o.price) : null,
        deliveryDate: o.deliveryDate?.toISOString().slice(0, 10) ?? null,
        note: o.note,
        rating: o.rating,
        score: o.score,
        status: o.status,
        selected: o.selected || undefined,
        fromDocument: r
          ? {
              items: part?.items,
              priceWithoutVat: part?.priceWithoutVat,
              priceWithVat: part?.priceWithVat,
              leadTime: part?.leadTime,
              summary: r.summary,
              warnings: r.warnings,
              validUntil: r.validUntil,
            }
          : undefined,
      };
    });

    const { data, costUsd } = await callModel<ComparisonResult>(
      c.model,
      COMPARE_INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Poptávka: ${req.title}` +
            (req.description ? `\nSpecifikace: ${req.description}` : "") +
            (req.quantity != null ? `\nMnožství: ${Number(req.quantity)} ${req.unit}` : "") +
            (req.requiredDate ? `\nPotřeba do: ${req.requiredDate.toISOString().slice(0, 10)}` : "") +
            `\n\nNabídky:\n${JSON.stringify(offers, null, 1)}` +
            (c.prompt ? `\n\nPokyn uživatele: ${c.prompt}` : ""),
        },
      ],
      "comparison",
      COMPARE_SCHEMA,
    );
    await prisma.offerComparison.update({
      where: { id: c.id },
      data: { status: "ready", result: data as unknown as Prisma.InputJsonValue, costUsd },
    });
  } catch (err) {
    await prisma.offerComparison
      .update({
        where: { id: comparisonId },
        data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" },
      })
      .catch(() => {});
  }
}
