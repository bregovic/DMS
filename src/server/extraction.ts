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

/**
 * Pojistky proti zbytečnému čerpání API (vše jde přepsat proměnnou prostředí):
 *  - AI_DISABLED=1            vypne všechna volání
 *  - AI_MONTHLY_LIMIT_USD     strop za kalendářní měsíc (5 USD)
 *  - AI_DAILY_LIMIT_USD       strop za den (1 USD)
 *  - AI_MAX_RUNS_PER_HOUR     max spuštění na uživatele za hodinu (20)
 *  - AI_MAX_PARALLEL          max souběžných běhů na uživatele (3)
 *  - AI_MAX_FILE_MB           větší soubor se modelu neposílá (12 MB)
 * Model navíc dostává strop délky odpovědi a nízkou úroveň přemýšlení
 * (u plánu střední) – přemýšlení tvořilo ~70 % výstupních tokenů.
 */
export const AI_LIMITS = {
  monthlyUsd: Number(process.env.AI_MONTHLY_LIMIT_USD || 5),
  dailyUsd: Number(process.env.AI_DAILY_LIMIT_USD || 1),
  runsPerHour: Number(process.env.AI_MAX_RUNS_PER_HOUR || 20),
  parallel: Number(process.env.AI_MAX_PARALLEL || 3),
  maxFileBytes: Number(process.env.AI_MAX_FILE_MB || 12) * 1024 * 1024,
  disabled: process.env.AI_DISABLED === "1",
};
// Běh, který nedoběhl (restart serveru), se po 15 minutách uzavře jako chyba.
const STALE_MS = 25 * 60 * 1000;
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
  /** Rozpory proti specifikaci poptávky: jiný rozměr, počet, provedení, chybějící kus. */
  mismatches: string[];
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
    /** Číslo účtu nebo IBAN – bývá až v patičce nebo na poslední straně. */
    bankAccount: string | null;
  };
  offerNumber: string | null;
  /** Platební podmínky: záloha, splatnost, způsob úhrady. */
  paymentTerms: string | null;
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
  vendor: obj({ name: str, ico: str, dic: str, email: str, phone: str, web: str, address: str, contactPerson: str, bankAccount: str }),
  offerNumber: str,
  paymentTerms: str,
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
      mismatches: strArr,
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
mismatches: porovnej položky té části se specifikací poptávky (pole specification a quantity) – rozměry, počty, provedení, materiál. Každý rozpor jednou krátkou větou česky, např. "okno ložnice 1530×1250 mm, nabídka uvádí 1500×1250 mm" nebo "poptávka žádá 5 ks, nabídka pokrývá 3 ks". Vypisuj jen rozdíly, ne shody. Když specifikace chybí nebo vše sedí, vrať prázdné pole.
U technického dokumentu nech parts prázdné a do technicalSpecs dej klíčové parametry (rozměry, U-hodnoty, materiály, barvy, požadavky na stavební připravenost).
vendor.bankAccount = číslo účtu dodavatele (formát 123456789/0100) nebo IBAN – hledej i v patičce, v hlavičce a na poslední straně; když tam není, vrať null.
paymentTerms = platební podmínky textem: záloha (kolik %, kdy), splatnost, způsob úhrady. Když nejsou uvedené, vrať null.
Ceny jako čísla v Kč (bez mezer), data YYYY-MM-DD, leadTime textem (např. "6–12 týdnů").
summary česky 2–4 věty: co dokument obsahuje, co je v ceně a co ne, záruky, platnost.
warnings: rozpory se specifikací poptávky, chybějící montáž/doprava, krátká platnost, nejasnosti.
Pokyn uživatele (pokud je) má přednost.`;

const COMPARE_INSTRUCTIONS = `Jsi nezávislý poradce stavebníka. Porovnej nabídky k jedné poptávce a připrav stručný, přehledný podklad pro výběr, česky.
columns: 4–7 nejdůležitějších srovnávacích hledisek (vždy "Cena s DPH" a "Dodání"; dál podle poptávky a pokynu – např. profil, Uw/Ug, záruka, montáž v ceně, co chybí).
rows: jeden řádek na nabídku, offer = název dodavatele, cells ve stejném pořadí jako columns, krátce (max ~6 slov), neznámé = "?".
Nabídka označená castSpolecneNabidky je část společné nabídky na víc poptávek: když u ní chybí cena, nepiš "?" ani ji neber jako nejdražší – napiš "v ceně balíčku" a v poznámkách upozorni, že se dá srovnat jen za celý balíček.
pros: u každé nabídky 1–3 plusy a 1–3 minusy.
recommendation: 2–3 věty, kterou vybrat a proč; když se nedá rozhodnout, co chybí.
questions: co si ověřit u dodavatelů před objednáním (max 5).
headline: jedna věta shrnutí. Pokyn uživatele má přednost (co je pro něj důležité).`;

const BUNDLE_COMPARE_INSTRUCTIONS = `Jsi nezávislý poradce stavebníka. Porovnej nabídky na poptávkový balíček – několik poptávek, o kterých se rozhoduje společně (např. okna, dveře, portál). Odpovídej česky.
Firmy odpovídají různě: některá pošle jednu společnou cenu za celý balíček (i bez rozpadu na jednotlivé poptávky), jiná samostatné nabídky jen na část. To je v pořádku – právě proto se porovnává za celek.
columns: první sloupce = názvy poptávek v pořadí, jak přijdou na vstupu, pak "Celkem" a "Dodání"; případně 1–2 další zásadní hlediska.
rows: jeden řádek na firmu, offer = název firmy, cells ve stejném pořadí jako columns.
- cena za poptávku, kterou firma rozepsala → číslo v Kč,
- poptávka krytá společnou cenou bez rozpadu → "v ceně balíčku",
- poptávka, kterou firma vůbec nenabídla → "nenabídla",
- neznámý údaj → "?".
pros: u každé firmy 1–3 plusy a 1–3 minusy; pokrytí balíčku (co nenabídla) patří mezi minusy.
recommendation: 3–5 vět. Vždy porovnej dvě varianty: (a) nejlevnější **jedna firma** na celý balíček, (b) nejlevnější **kombinace** firem po poptávkách. Napiš rozdíl v Kč a jestli se balíčková cena vyplatí i proti kombinaci – a připomeň, co kombinace stojí navíc (víc smluv, dělená odpovědnost za montáž a návaznost na stavbu). Spočítané součty dostaneš na vstupu, neměň je.
questions: co si ověřit před objednáním (max 5) – zvlášť u firem, které cenu nerozepsaly.
headline: jedna věta shrnutí.
Pokyn uživatele má přednost.`;

/** Útrata za AI od daného okamžiku (USD) – vytěžení, porovnání i plány. */
async function aiSpendSince(since: Date) {
  const a = await prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true } });
  return a._sum.costUsd ?? 0;
}

/** Útrata za AI v aktuálním měsíci (USD). */
export async function monthlyAiSpend() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return aiSpendSince(start);
}

/** Přehled útraty a limitů (pro Nastavení a dialogy AI). */
export async function aiUsage() {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const [month, today] = await Promise.all([monthlyAiSpend(), aiSpendSince(day)]);
  return { month, today, limits: AI_LIMITS, configured: !!process.env.OPENAI_API_KEY };
}

/** Zaseknuté běhy (restart serveru uprostřed volání) uzavřít jako chybu. */
async function closeStaleRuns() {
  const before = new Date(Date.now() - STALE_MS);
  const data = { status: "error", error: "Běh nedoběhl (přerušeno) – spusť znovu." };
  const where = { status: "running", createdAt: { lt: before } };
  await Promise.all([
    prisma.extraction.updateMany({ where, data }),
    prisma.offerComparison.updateMany({ where, data }),
    prisma.planDraft.updateMany({ where, data }),
  ]);
}

/**
 * Pojistky před každým voláním AI: vypínač, měsíční a denní strop,
 * počet spuštění za hodinu a souběžné běhy uživatele.
 */
export async function assertBudget(userId?: string) {
  if (AI_LIMITS.disabled) throw new Error("Automatické zpracování je vypnuté.");
  if (!process.env.OPENAI_API_KEY) throw new Error("Automatické zpracování není nastavené.");
  await closeStaleRuns();
  const u = await aiUsage();
  if (u.month >= AI_LIMITS.monthlyUsd)
    throw new Error(`Měsíční limit automatického zpracování (${AI_LIMITS.monthlyUsd} USD) je vyčerpaný.`);
  if (u.today >= AI_LIMITS.dailyUsd)
    throw new Error(`Denní limit automatického zpracování (${AI_LIMITS.dailyUsd} USD) je vyčerpaný – zkus to zítra.`);
  if (userId) {
    const hour = new Date(Date.now() - 3600_000);
    const mine = { createdById: userId };
    const [e, c, p, re, rc, rp] = await Promise.all([
      prisma.extraction.count({ where: { ...mine, createdAt: { gte: hour } } }),
      prisma.offerComparison.count({ where: { ...mine, createdAt: { gte: hour } } }),
      prisma.planDraft.count({ where: { ...mine, createdAt: { gte: hour } } }),
      prisma.extraction.count({ where: { ...mine, status: "running" } }),
      prisma.offerComparison.count({ where: { ...mine, status: "running" } }),
      prisma.planDraft.count({ where: { ...mine, status: "running" } }),
    ]);
    if (e + c + p >= AI_LIMITS.runsPerHour)
      throw new Error(`Za poslední hodinu už bylo ${e + c + p} zpracování (limit ${AI_LIMITS.runsPerHour}). Zkus to za chvíli.`);
    if (re + rc + rp >= AI_LIMITS.parallel)
      throw new Error("Už běží několik zpracování – počkej, až doběhnou.");
  }
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
export async function filePart(buf: Buffer, name: string, mimeType: string) {
  const e = ext(name);
  if (buf.length > AI_LIMITS.maxFileBytes)
    throw new Error(`Soubor „${name}“ je pro AI moc velký (limit ${Math.round(AI_LIMITS.maxFileBytes / 1048576)} MB).`);
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
export async function callModel<T>(
  model: string,
  system: string,
  content: unknown[],
  name: string,
  schema: unknown,
  opts: { effort?: "minimal" | "low" | "medium"; maxOutput?: number; webSearch?: boolean } = {},
): Promise<{ data: T; costUsd: number; inTok: number; outTok: number }> {
  // Úloha na pozadí u OpenAI + průběžná kontrola: dlouhé volání (plán z mnoha
  // PDF trvá i přes 5 min) jinak spadne na výchozím limitu Node fetch
  // („fetch failed“ po 300 s čekání na hlavičky odpovědi).
  const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" };
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      background: true,
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      text: { format: { type: "json_schema", name, strict: true, schema } },
      reasoning: { effort: opts.effort ?? "low" },
      ...(opts.webSearch ? { tools: [{ type: "web_search", search_context_size: "low" }] } : {}),
      max_output_tokens: opts.maxOutput ?? 12_000,
    }),
  });
  let j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `OpenAI HTTP ${res.status}`);
  const deadline = Date.now() + 20 * 60_000;
  while (j.status === "queued" || j.status === "in_progress") {
    if (Date.now() > deadline) {
      await fetch(`https://api.openai.com/v1/responses/${j.id}/cancel`, { method: "POST", headers }).catch(() => {});
      throw new Error("Zpracování trvalo příliš dlouho – zkus méně dokumentů.");
    }
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`https://api.openai.com/v1/responses/${j.id}`, { headers, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!poll) continue; // krátký výpadek sítě – zkusit znovu
    const pj = await poll.json().catch(() => null);
    if (poll.ok && pj) j = pj;
  }
  if (j.status === "failed") throw new Error(j.error?.message || "Zpracování selhalo.");
  if (j.status === "cancelled") throw new Error("Zpracování bylo zrušeno.");
  const inTok = j.usage?.input_tokens ?? 0;
  const outTok = j.usage?.output_tokens ?? 0;
  const [pin, pout] = PRICES[model] ?? PRICES["gpt-5-mini"];
  // + vyhledávání na webu (0,01 USD za dotaz)
  const searches = (j.output ?? []).filter((o: { type: string }) => o.type === "web_search_call").length;
  const costUsd = (inTok * pin + outTok * pout) / 1_000_000 + searches * 0.01;
  // Útrata do trvalého záznamu (limity) – zaplacená je i useknutá odpověď.
  await prisma.aiUsageLog.create({ data: { kind: name, model, costUsd } }).catch(() => {});
  if (j.status === "incomplete")
    throw new Error("Výsledek byl useknutý (strop délky) – zkus menší dokument nebo užší upřesnění.");
  const text = j.output
    ?.find((o: { type: string }) => o.type === "message")
    ?.content?.find((c: { type: string }) => c.type === "output_text")?.text;
  if (!text) throw new Error("Model nevrátil výsledek.");
  return { data: JSON.parse(text) as T, costUsd, inTok, outTok };
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
  await assertBudget(userId);
  const busy = await prisma.extraction.findFirst({ where: { documentId: doc.id, status: "running" }, select: { id: true } });
  if (busy) throw new Error("Tahle příloha se už zpracovává.");
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
        document: { select: { fileName: true, originalName: true, mimeType: true, note: true } },
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
            (ex.instructions ? `\n\nPokyn uživatele: ${ex.instructions}` : "") +
            (ex.document.note ? `\n\nPoznámka uživatele k dokumentu (změny oproti němu): ${ex.document.note}` : ""),
        },
        part,
      ],
      "document",
      EXTRACT_SCHEMA,
      { effort: "low", maxOutput: 14_000 },
    );
    // requestId, který model vymyslel, zahodit
    const known = new Set(requests.map((r) => r.id));
    for (const p of result.parts) if (p.requestId && !known.has(p.requestId)) p.requestId = null;

    await prisma.extraction.update({
      where: { id: ex.id },
      data: {
        // Bez cen (technický list…) není co potvrzovat – jen údaje k nahlédnutí.
        status: result.parts.length ? "ready" : "info",
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
  await assertBudget(userId);
  const busy = await prisma.offerComparison.findFirst({ where: { requestId, status: "running" }, select: { id: true } });
  if (busy) throw new Error("Porovnání už běží.");
  const c = await prisma.offerComparison.create({
    data: { requestId, prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return c.id;
}

/** Porovnání za celý poptávkový balíček (#40). */
export async function createBundleComparison(bundleId: string, userId: string, prompt?: string | null) {
  const [offers, parts] = await Promise.all([
    prisma.bundleOffer.count({ where: { bundleId } }),
    prisma.offer.count({ where: { request: { bundleId } } }),
  ]);
  if (offers + parts === 0) throw new Error("Balíček zatím nemá žádnou nabídku.");
  await assertBudget(userId);
  const busy = await prisma.offerComparison.findFirst({ where: { bundleId, status: "running" }, select: { id: true } });
  if (busy) throw new Error("Porovnání už běží.");
  const c = await prisma.offerComparison.create({
    data: { bundleId, prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return c.id;
}

export async function runBundleComparison(comparisonId: string) {
  try {
    const c = await prisma.offerComparison.findUnique({
      where: { id: comparisonId },
      select: { id: true, bundleId: true, prompt: true, model: true },
    });
    if (!c?.bundleId) return;
    const { evaluateBundle } = await import("@/server/bundles");
    const ev = await evaluateBundle(c.bundleId);
    if (!ev) return;

    const czk = (x: number | null) => (x == null ? null : Math.round(x));
    const vendors = ev.vendors.map((v) => ({
      firma: v.name,
      celkem: czk(v.total),
      spolecnaCenaZaBalicek: czk(v.bundlePrice),
      kryjeCelyBalicek: v.full,
      dodani: v.deliveryDate?.toISOString().slice(0, 10) ?? null,
      poznamka: v.note,
      poPoptavkach: ev.requests.map((r) => {
        const cell = v.cells[r.id];
        if (!cell?.covered) return { poptavka: r.title, stav: "nenabídla" };
        return {
          poptavka: r.title,
          stav: cell.price != null ? "cena" : cell.source === "bundle" ? "v ceně balíčku" : "bez ceny",
          cena: czk(cell.price),
        };
      }),
    }));

    const { data, costUsd } = await callModel<ComparisonResult>(
      c.model,
      BUNDLE_COMPARE_INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Balíček: ${ev.name}` +
            (ev.note ? `\nPoznámka: ${ev.note}` : "") +
            `\nPoptávky v balíčku (v tomhle pořadí dělej sloupce): ${ev.requests.map((r) => r.title).join(", ")}` +
            `\n\nNabídky:\n${JSON.stringify(vendors, null, 1)}` +
            `\n\nSpočítané součty (neměň je):\n` +
            (ev.bestSingle
              ? `- nejlevnější jedna firma na celý balíček: ${ev.bestSingle.name}, ${Math.round(ev.bestSingle.total)} Kč\n`
              : `- celý balíček zatím nepokrývá žádná jedna firma\n`) +
            (ev.bestCombo
              ? `- nejlevnější kombinace: ${Math.round(ev.bestCombo.total)} Kč (${ev.bestCombo.picks
                  .map((p) => `${ev.requests.find((r) => r.id === p.requestId)?.title}: ${p.vendorName} ${Math.round(p.price)} Kč`)
                  .join("; ")})\n`
              : `- kombinaci nelze spočítat, u některé poptávky chybí rozepsaná cena\n`) +
            (ev.comboSaving != null ? `- rozdíl kombinace vs. jedna firma: ${Math.round(ev.comboSaving)} Kč\n` : "") +
            (c.prompt ? `\nPokyn uživatele: ${c.prompt}` : ""),
        },
      ],
      "comparison",
      COMPARE_SCHEMA,
      { effort: "low", maxOutput: 8_000 },
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

export async function runComparison(comparisonId: string) {
  try {
    const c = await prisma.offerComparison.findUnique({
      where: { id: comparisonId },
      select: { id: true, requestId: true, prompt: true, model: true },
    });
    if (!c?.requestId) return;
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
            bundleOffer: {
              select: { price: true, bundle: { select: { name: true } }, offers: { select: { requestId: true } } },
            },
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
        // Část společné nabídky na balíček: cena tady klidně chybí, platná je
        // celková cena za balíček – porovnání to nesmí brát jako „bez ceny“.
        castSpolecneNabidky: o.bundleOffer
          ? {
              balicek: o.bundleOffer.bundle.name,
              poptavekVBalicku: o.bundleOffer.offers.length,
              celkemZaBalicek: o.bundleOffer.price != null ? Number(o.bundleOffer.price) : null,
            }
          : undefined,
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
      { effort: "low", maxOutput: 8_000 },
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
