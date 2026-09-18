import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Vytěžení cenové nabídky přes OpenAI (#33).
 *
 * Z PDF nebo fotky nabídky vytáhne dodavatele, ceny a podmínky a rozdělí
 * je mezi otevřené žádanky projektu – jedna nabídka na okna, dveře i portál
 * se rozpadne na tři části. Výsledek je jen návrh (Extraction.result);
 * dodavatel a nabídky se založí až po potvrzení v aplikaci.
 *
 * Klíč OPENAI_API_KEY (stejný účet jako Karacho). Model AI_MODEL, výchozí
 * gpt-5-mini – nabídka stojí zhruba 0,01 USD. Měsíční strop AI_MONTHLY_LIMIT_USD
 * (výchozí 5 USD) hlídá součet costUsd za kalendářní měsíc.
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

export type ExtractedPart = {
  requestId: string | null;
  label: string;
  items: string[];
  priceWithoutVat: number | null;
  priceWithVat: number | null;
  leadTime: string | null;
  note: string | null;
};
export type ExtractionResult = {
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
  summary: string;
  warnings: string[];
};

const n = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "offerNumber", "offerDate", "validUntil", "totalWithoutVat", "totalWithVat", "parts", "summary", "warnings"],
  properties: {
    vendor: {
      type: "object",
      additionalProperties: false,
      required: ["name", "ico", "dic", "email", "phone", "web", "address", "contactPerson"],
      properties: { name: str, ico: str, dic: str, email: str, phone: str, web: str, address: str, contactPerson: str },
    },
    offerNumber: str,
    offerDate: str,
    validUntil: str,
    totalWithoutVat: n,
    totalWithVat: n,
    parts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requestId", "label", "items", "priceWithoutVat", "priceWithVat", "leadTime", "note"],
        properties: {
          requestId: str,
          label: { type: "string" },
          items: { type: "array", items: { type: "string" } },
          priceWithoutVat: n,
          priceWithVat: n,
          leadTime: str,
          note: str,
        },
      },
    },
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
};

const INSTRUCTIONS = `Jsi asistent stavebníka. Z přiložené cenové nabídky vytěž dodavatele, ceny a podmínky.
Nabídka může pokrývat víc poptávek najednou (např. okna, vstupní dveře, HS portál). Rozděl ji na části:
- jedna část = jedna poptávka ze seznamu (requestId); položky patřící ke stejné poptávce sečti do jedné části a vypiš je v items,
- podíl společných položek (doprava, montáž, zaměření, demontáž) rozpočítej do částí poměrem cen a zmiň to v note,
- co nepasuje k žádné poptávce, dej jako část s requestId null,
- poptávky, které nabídka vůbec nepokrývá, nevracej.
Ceny jako čísla v Kč (bez mezer), data YYYY-MM-DD, leadTime textem (např. "6–12 týdnů").
summary česky 2–4 věty: co je v ceně, co ne, záruky, platnost. warnings: rozpory se specifikací poptávky, chybějící montáž/doprava, krátká platnost apod.`;

/** Útrata za AI v aktuálním měsíci (USD). */
export async function monthlyAiSpend() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.extraction.aggregate({
    where: { createdAt: { gte: start } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

export function aiConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

/** Dá se ze souboru číst? PDF a obrázky ano; e-maily, Word, Excel zatím ne. */
export function extractable(mimeType: string, name: string) {
  const lower = name.toLowerCase();
  return mimeType === "application/pdf" || lower.endsWith(".pdf") || mimeType.startsWith("image/");
}

/** Založí záznam vytěžení a vrátí jeho id (běh spouští runExtraction). */
export async function createExtraction(documentId: string, userId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, projectId: true, requestId: true },
  });
  if (!doc?.requestId) throw new Error("Příloha nepatří k žádance.");
  if (!aiConfigured()) throw new Error("Vytěžení není nastavené (chybí OPENAI_API_KEY).");
  if ((await monthlyAiSpend()) >= MONTHLY_LIMIT_USD)
    throw new Error(`Měsíční limit pro AI (${MONTHLY_LIMIT_USD} USD) je vyčerpaný.`);
  const ex = await prisma.extraction.create({
    data: {
      projectId: doc.projectId,
      requestId: doc.requestId,
      documentId: doc.id,
      model: AI_MODEL,
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
    const isPdf = ex.document.mimeType === "application/pdf" || ex.document.originalName.toLowerCase().endsWith(".pdf");
    const filePart = isPdf
      ? {
          type: "input_file",
          filename: ex.document.originalName,
          file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
        }
      : { type: "input_image", image_url: `data:${ex.document.mimeType};base64,${buf.toString("base64")}` };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model: ex.model,
        input: [
          { role: "system", content: INSTRUCTIONS },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Otevřené poptávky projektu (attachedHere = nabídka je přiložená u této):\n${JSON.stringify(reqList, null, 1)}`,
              },
              filePart,
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "offer", strict: true, schema: SCHEMA } },
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `OpenAI HTTP ${res.status}`);

    const text = j.output
      ?.find((o: { type: string }) => o.type === "message")
      ?.content?.find((c: { type: string }) => c.type === "output_text")?.text;
    if (!text) throw new Error("Model nevrátil výsledek.");
    const result = JSON.parse(text) as ExtractionResult;
    // requestId, který model vymyslel, zahodit
    const known = new Set(requests.map((r) => r.id));
    for (const p of result.parts) if (p.requestId && !known.has(p.requestId)) p.requestId = null;

    const inTok = j.usage?.input_tokens ?? 0;
    const outTok = j.usage?.output_tokens ?? 0;
    const [pin, pout] = PRICES[ex.model] ?? PRICES["gpt-5-mini"];
    await prisma.extraction.update({
      where: { id: ex.id },
      data: {
        status: "ready",
        result: result as unknown as Prisma.InputJsonValue,
        inputTokens: inTok,
        outputTokens: outTok,
        costUsd: (inTok * pin + outTok * pout) / 1_000_000,
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
