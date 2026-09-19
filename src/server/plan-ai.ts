import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";
import { AI_MODEL, assertBudget, callModel, extractable, filePart } from "@/server/extraction";
import { calcOperation } from "@/lib/process-calc";

/** Plán z dokumentace potřebuje silnější model než vytěžení nabídky (AI_PLAN_MODEL). */
const PLAN_MODEL = process.env.AI_PLAN_MODEL || "gpt-5";
const MAX_PLAN_DOCS = 20;

/**
 * AI plán projektu z dokumentace (#34).
 *
 * Z technické dokumentace a plánků projektu (PDF, fotky, Word, Excel)
 * a z katalogu úkonů navrhne fáze a úkoly s odhadem dní, nákladů
 * a tím, co se má poptat u dodavatelů. Výsledek je návrh (PlanDraft),
 * po potvrzení se založí fáze a úkoly a termíny spočítá plánovač
 * („Přepočítat termíny“). Z úkolů s „poptat“ jde pak tlačítkem udělat
 * žádanky pro výběr dodavatelů.
 */

export type PlanTaskAi = {
  title: string;
  operationCode: string | null;
  quantity: number | null;
  unit: string | null;
  estimateDays: number;
  costEstimate: number | null;
  profession: string | null;
  procurement: string | null;
  note: string | null;
};
export type PlanPhaseAi = { title: string; tasks: PlanTaskAi[] };
export type PlanResult = {
  summary: string;
  assumptions: string[];
  missingInfo: string[];
  totalCost: number | null;
  durationDays: number | null;
  phases: PlanPhaseAi[];
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
const PLAN_SCHEMA = obj({
  summary: { type: "string" },
  assumptions: strArr,
  missingInfo: strArr,
  totalCost: n,
  durationDays: n,
  phases: {
    type: "array",
    items: obj({
      title: { type: "string" },
      tasks: {
        type: "array",
        items: obj({
          title: { type: "string" },
          operationCode: str,
          quantity: n,
          unit: str,
          estimateDays: { type: "number" },
          costEstimate: n,
          profession: str,
          procurement: str,
          note: str,
        }),
      },
    }),
  },
});

const PLAN_INSTRUCTIONS = `Jsi zkušený stavbyvedoucí a rozpočtář v Česku. Z přiložené dokumentace stavby (technická zpráva, výkresy, výkazy, fotky) připrav realistický plán prací.
- phases: fáze v pořadí, jak jdou na stavbě po sobě (např. Příprava, Zemní práce, Základy, Hrubá stavba, Střecha, Okna a dveře, Instalace – Elektro, Instalace – Voda, Instalace – Vytápění, Omítky a potěry, Fasáda, Dokončovací práce, Venkovní úpravy). Jen fáze, které stavba opravdu potřebuje.
- ÚROVEŇ DETAILU jako skutečný harmonogram stavbyvedoucího: každá fáze 4–10 konkrétních úkolů. Každé podlaží zvlášť (hrubá stavba 1. NP, strop/věnec, hrubá stavba 2. NP…), střecha rozepsaná po vrstvách (nosná konstrukce, záklop/laťování, pojistná hydroizolace, krytina, oplechování, žlaby a svody, izolace).
  Kontrolní seznam – zahrň, co se stavby týká: vytyčení stavby geodetem, zařízení staveniště (oplocení, voda, elektro, WC, kontejner), přípojky, sejmutí ornice, výkopy, převzetí základové spáry, základy, hydroizolace a protiradonové lepenky, podkladní desky, zdění po podlažích, překlady, věnce, stropy (bednění, výztuž, betonáž, zrání, odbednění), komíny/prostupy, střecha, klempířské prvky, okna/dveře/vrata (objednávka s dodací lhůtou předem), hrubé rozvody TZB po profesích, omítky, potěry + vysychání, zateplení a fasáda, lešení (montáž/demontáž), podlahy, obklady, kompletace TZB, revize a zkoušky, venkovní úpravy, úklid, geodetické zaměření, kolaudace.
- tasks: konkrétní úkoly ve fázi v pořadí provádění. Kde odpovídá úkon z katalogu, dej jeho operationCode a množství (quantity, unit) z výkresů/výkazů. estimateDays = pracovní dny party; technologické přestávky (zrání betonu, vysychání) jako samostatný úkol.
- costEstimate: odhad nákladů úkolu v Kč s DPH (materiál + práce, ceny ČR 2026) – vyplň u KAŽDÉHO úkolu (i při úpravě návrhu); null jen u úkolů bez nákladů.
- estimateDays = KALENDÁŘNÍ dny, jak to na stavbě reálně trvá: včetně víkendů, počasí, koordinace řemesel a menší party (u svépomoci počítej s pomalejším tempem, typicky 1,5–2× déle). Nikdy nepiš jen čistou pracnost.
- Dodací lhůty a čekání jako samostatné úkoly (např. „Výroba oken a dveří – dodací lhůta“ 56 d, „Výroba krovu“, „Čekání na betonárku/jeřáb“), stejně tak zrání betonu a vysychání potěrů (cca 1 týden na 1 cm potěru).
- procurement: když se na úkol typicky poptává dodavatel nebo materiál (okna, střecha, elektro, beton, lešení…), krátký text co poptat vč. hlavních parametrů (rozměry, množství); jinak null.
- profession: řemeslo (Zedník, Tesař, Elektrikář…).
- summary 2–4 věty česky; assumptions: z čeho vycházíš; missingInfo: co v dokumentaci chybí a zpřesnilo by plán.
- totalCost a durationDays: součet nákladů a celková délka v kalendářních dnech.
Nevymýšlej rozměry, které v dokumentaci nejsou – pak dej quantity null a zmiň to v missingInfo. Pokyn uživatele má přednost.`;

/** Dokumenty projektu, které AI umí přečíst (pro výběr v dialogu). */
export async function planDocuments(projectId: string) {
  const docs = await prisma.document.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, originalName: true, mimeType: true, size: true, type: true, requestId: true },
  });
  // Poznámky uživatele a technické/průvodní zprávy první – nesmí vypadnout z limitu.
  const rank = (n: string) =>
    /\.txt$/i.test(n) ? 0 : /zpr[aá]v|technick|souhrn|pr[uů]vodn/i.test(n) ? 1 : /v[yý]kaz|rozpo[cč]et/i.test(n) ? 2 : 3;
  return docs
    .filter((d) => extractable(d.mimeType, d.originalName))
    .sort((a, b) => rank(a.originalName) - rank(b.originalName));
}

/** Značka úkolů vzniklých z plánu z dokumentace (poznají se při nahrazení). */
export const PLAN_MARK = "Navrženo z dokumentace.";
const PLAN_MARKS = [PLAN_MARK, "Navrženo AI z dokumentace."];

/** Úkoly a fáze dřívějšího plánu z dokumentace, které jde bezpečně nahradit
 *  (nezačaté, bez výdajů a žádanek). */
export async function replaceableTaskIds(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      kind: { in: ["task", "phase"] },
      status: { in: ["todo", "rozhodnout"] },
      actualStart: null,
      expenses: { none: {} },
      requests: { none: {} },
    },
    select: { id: true, kind: true, parentId: true, description: true },
  });
  const kids = new Set(
    tasks.filter((t) => t.kind === "task" && PLAN_MARKS.some((m) => t.description?.includes(m))).map((t) => t.id),
  );
  const all = await prisma.task.findMany({ where: { projectId }, select: { id: true, parentId: true } });
  // fáze jen když jsou dřívějším plánem (značka) nebo po smazání zůstanou prázdné
  const phases = tasks
    .filter((t) => t.kind === "phase")
    .filter(
      (ph) =>
        PLAN_MARKS.some((m) => ph.description?.includes(m)) ||
        (all.some((c) => c.parentId === ph.id) && all.filter((c) => c.parentId === ph.id).every((c) => kids.has(c.id))),
    )
    .filter((ph) => all.filter((c) => c.parentId === ph.id).every((c) => kids.has(c.id)))
    .map((ph) => ph.id);
  return [...kids, ...phases];
}

export async function createPlanDraft(
  projectId: string,
  userId: string,
  documentIds: string[],
  prompt?: string | null,
  replaceExisting = false,
) {
  await assertBudget(userId);
  const busy = await prisma.planDraft.findFirst({ where: { projectId, status: "running" }, select: { id: true } });
  if (busy) throw new Error("Na plánu projektu už běží zpracování – počkej, až doběhne.");
  const allowed = new Set((await planDocuments(projectId)).map((d) => d.id));
  const ids = documentIds.filter((id) => allowed.has(id)).slice(0, MAX_PLAN_DOCS);
  const d = await prisma.planDraft.create({
    data: { projectId, documentIds: ids, prompt: prompt?.trim() || null, model: PLAN_MODEL, createdById: userId, replaceExisting },
    select: { id: true },
  });
  return d.id;
}

export async function runPlanDraft(draftId: string) {
  try {
    const d = await prisma.planDraft.findUnique({
      where: { id: draftId },
      select: {
        id: true,
        model: true,
        prompt: true,
        documentIds: true,
        replaceExisting: true,
        project: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
            startDate: true,
            plannedEnd: true,
            ownerId: true,
            tasks: { select: { id: true, title: true, kind: true, status: true }, take: 400 },
          },
        },
      },
    });
    if (!d) return;
    const p = d.project;
    // Při nahrazení se dřívější nezačatý plán neukazuje jako „už existující“.
    if (d.replaceExisting) {
      const drop = new Set(await replaceableTaskIds(p.id));
      p.tasks = p.tasks.filter((t) => !drop.has(t.id));
    }

    const [ops, docs] = await Promise.all([
      prisma.operation.findMany({
        select: { code: true, name: true, unit: true, category: true, laborRate: true, crew: true, techPauseDays: true },
        orderBy: { code: "asc" },
      }),
      prisma.document.findMany({
        where: { id: { in: d.documentIds }, projectId: p.id },
        select: { fileName: true, originalName: true, mimeType: true, note: true },
      }),
    ]);

    const parts: unknown[] = [];
    const skipped: string[] = [];
    for (const doc of docs) {
      try {
        parts.push(await filePart(await storage.read(doc.fileName), doc.originalName, doc.mimeType));
      } catch {
        skipped.push(doc.originalName);
      }
    }

    const context = {
      projekt: p.name,
      typ: p.type,
      popis: p.description,
      zacatek: p.startDate?.toISOString().slice(0, 10) ?? null,
      ocekavaneDokonceni: p.plannedEnd?.toISOString().slice(0, 10) ?? null,
      uzExistujiciUkoly: p.tasks.map((t) => `${t.kind === "phase" ? "Fáze" : "Úkol"}: ${t.title} (${t.status})`),
      katalogUkonu: ops.map((o) => ({
        code: o.code,
        name: o.name,
        unit: o.unit,
        category: o.category,
        sazbaKcNaHodinu: o.laborRate != null ? Number(o.laborRate) : null,
        parta: o.crew,
        technologickaPauzaDni: o.techPauseDays,
      })),
      nepodarilo_se_precist: skipped,
      // „Změny oproti dokumentaci“ od uživatele – mají přednost před dokumentací.
      poznamkyKDokumentum: docs.filter((x) => x.note).map((x) => ({ soubor: x.originalName, poznamka: x.note })),
    };

    const { data, costUsd } = await callModel<PlanResult>(
      d.model,
      PLAN_INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Kontext projektu (JSON):\n${JSON.stringify(context, null, 1)}` +
            (context.uzExistujiciUkoly.length ? "\nNeduplikuj úkoly, které už v projektu jsou." : "") +
            (context.poznamkyKDokumentum.length ? "\nPoznámky uživatele k dokumentům popisují změny oproti dokumentaci – mají přednost." : "") +
            (d.prompt ? `\n\nPokyn uživatele: ${d.prompt}` : "") +
            (parts.length ? "" : "\n\nDokumentace není přiložená – plán postav z popisu projektu a uveď to v missingInfo."),
        },
        ...parts,
      ],
      "plan",
      PLAN_SCHEMA,
      { effort: "medium", maxOutput: 60_000 },
    );
    await prisma.planDraft.update({
      where: { id: d.id },
      data: { status: "ready", result: data as unknown as Prisma.InputJsonValue, costUsd },
    });
  } catch (err) {
    await prisma.planDraft
      .update({
        where: { id: draftId },
        data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" },
      })
      .catch(() => {});
  }
}

/** Data pro panel PlanAi (dokumenty, poslední návrh, kolik úkolů jde poptat). */
export async function planAiProps(projectId: string) {
  const [docs, draft, procurable] = await Promise.all([
    planDocuments(projectId),
    prisma.planDraft.findFirst({
      where: { projectId, kind: "plan", status: { in: ["running", "ready", "error"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, error: true },
    }),
    prisma.task.count({
      where: {
        projectId,
        procurement: { not: null },
        status: { notIn: ["done", "cancelled"] },
        requests: { none: {} },
      },
    }),
  ]);
  const [vendorSelection, costDraft, unestimated, estimated] = await Promise.all([
    vendorSelectionCandidates(projectId).then((c) => c.length),
    prisma.planDraft.findFirst({
      where: { projectId, kind: "costs", status: { in: ["running", "ready", "error"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, error: true },
    }),
    costCandidates(projectId).then((c) => c.length),
    costCandidates(projectId, true).then((c) => c.length),
  ]);
  return {
    projectId,
    docs: docs.map((d) => ({ id: d.id, name: d.originalName })),
    draft,
    procurable,
    vendorSelection,
    costDraft,
    unestimated,
    openTasks: estimated,
  };
}

/** Kolik dní před začátkem fáze má být vybraný dodavatel (poptávka, nabídky, smlouva). */
export const VENDOR_SELECTION_LEAD_DAYS = 21;
export const vendorSelectionTitle = (phase: string) => `Vybrat dodavatele – ${phase}`;

/**
 * Fáze, které potřebují výběr dodavatele a ještě nemají úkol na vlastníka:
 * nehotové, bez dodavatele fáze, ne svépomocí, a některý jejich úkol nemá
 * dodavatele ani řešitele.
 */
export async function vendorSelectionCandidates(projectId: string) {
  const [phases, todos] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId,
        kind: "phase",
        status: { notIn: ["done", "cancelled"] },
        vendorId: null,
        selfPerformed: false,
      },
      select: {
        id: true,
        title: true,
        startDate: true,
        subProjectId: true,
        children: {
          where: { status: { notIn: ["done", "cancelled"] } },
          select: { vendorId: true, selfPerformed: true, assigneeEmail: true },
        },
      },
    }),
    prisma.task.findMany({ where: { projectId, kind: "todo" }, select: { title: true } }),
  ]);
  const existing = new Set(todos.map((t) => t.title));
  return phases.filter(
    (p) =>
      p.children.length > 0 &&
      p.children.some((k) => !k.vendorId && !k.selfPerformed && !k.assigneeEmail) &&
      !existing.has(vendorSelectionTitle(p.title)),
  );
}

/** Založí vlastníkovi todo „Vybrat dodavatele – fáze“ s termínem před začátkem fáze. */
export async function createVendorSelectionTodos(projectId: string, userId: string) {
  const [cands, project] = await Promise.all([
    vendorSelectionCandidates(projectId),
    prisma.project.findUnique({ where: { id: projectId }, select: { owner: { select: { email: true } } } }),
  ]);
  if (!cands.length) return 0;
  const DAY = 86400000;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  await prisma.task.createMany({
    data: cands.map((p) => {
      const start = p.startDate?.getTime() ?? null;
      const due = start != null ? Math.max(today, start - VENDOR_SELECTION_LEAD_DAYS * DAY) : today + 7 * DAY;
      return {
        projectId,
        subProjectId: p.subProjectId,
        kind: "todo",
        title: vendorSelectionTitle(p.title),
        description:
          `Poptat a vybrat dodavatele pro fázi „${p.title}“` +
          (start != null ? ` (začíná ${new Date(start).toLocaleDateString("cs-CZ")})` : "") +
          `. Nabídky přidej k žádankám, porovnej a vyber – dodavatele pak nastav u fáze nebo jejích úkolů.`,
        status: "todo",
        priority: due - today <= 14 * DAY ? "high" : "medium",
        dueDate: new Date(due),
        assigneeEmail: project?.owner.email?.toLowerCase() ?? null,
        createdById: userId,
      };
    }),
  });
  return cands.length;
}

// ---------------------------------------------------------------------------
// Odhad nákladů stávajícího plánu
// ---------------------------------------------------------------------------

export type CostEstimateResult = {
  summary: string;
  items: { id: string; costEstimate: number | null; note: string | null }[];
  /** Přepočet: původní odhady (id → Kč) v okamžiku spuštění. */
  previous?: Record<string, number | null>;
};
const COST_SCHEMA = obj({
  summary: { type: "string" },
  items: {
    type: "array",
    items: obj({ id: { type: "string" }, costEstimate: n, note: str }),
  },
});
const COST_INSTRUCTIONS = `Jsi rozpočtář stavby v Česku. U každého úkolu stavebního plánu odhadni náklady v Kč s DPH (materiál + práce, ceny ČR 2026).
Vycházej z názvu, popisu, fáze, řemesla a délky (dny práce party). Úkol, který je jen administrativní nebo bez nákladů (rozhodnutí, kontrola, pauza), dej 0.
Když je k dispozici ceník z katalogu (ceny za MJ úkonů a balíčků s DPH), vycházej z něj: odhadni množství (m2, m, ks…) z názvu,
popisu a projektu a vynásob cenou za MJ; u úkolu s původním odhadem ho zohledni, ale oprav podle ceníku.
Když opravdu nejde odhadnout, null. note: krátce z čeho odhad vychází, např. „~40 m2 × balíček střecha 2 950 Kč“ (max ~12 slov).
summary: 1–2 věty – celkový odhad a hlavní nejistoty. Vrať položku pro každé zadané id. Pokyn uživatele má přednost.`;

/**
 * Úkoly k odhadu nákladů, které ještě nejsou hotové (a fáze bez úkolů):
 * bez odhadu, nebo při přepočtu (all) všechny.
 */
export async function costCandidates(projectId: string, all = false) {
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      kind: { in: ["task", "phase"] },
      ...(all ? {} : { costEstimate: null }),
      status: { notIn: ["done", "cancelled"] },
    },
    select: {
      id: true,
      costEstimate: true,
      kind: true,
      title: true,
      description: true,
      estimateDays: true,
      profession: true,
      parent: { select: { title: true } },
      subProject: { select: { name: true } },
      _count: { select: { children: true } },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  // fáze s úkoly se odhaduje přes své úkoly
  return tasks.filter((t) => !(t.kind === "phase" && t._count.children > 0));
}

export async function createCostDraft(projectId: string, userId: string, prompt?: string | null, all = false) {
  await assertBudget(userId);
  const busy = await prisma.planDraft.findFirst({ where: { projectId, status: "running" }, select: { id: true } });
  if (busy) throw new Error("Na plánu projektu už běží zpracování – počkej, až doběhne.");
  const n = (await costCandidates(projectId, all)).length;
  if (n === 0) throw new Error(all ? "V plánu nejsou nehotové úkoly." : "Všechny nehotové úkoly už odhad nákladů mají.");
  const d = await prisma.planDraft.create({
    // u odhadu nákladů znamená replaceExisting přepočet i úkolů, které odhad už mají
    data: { projectId, kind: "costs", replaceExisting: all, documentIds: [], prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return d.id;
}

export async function runCostDraft(draftId: string) {
  try {
    const d = await prisma.planDraft.findUnique({
      where: { id: draftId },
      select: { id: true, model: true, prompt: true, replaceExisting: true, project: { select: { id: true, name: true, type: true, description: true } } },
    });
    if (!d) return;
    const cands = (await costCandidates(d.project.id, d.replaceExisting)).slice(0, 250);
    const priceList = await catalogPriceList();
    const list = cands.map((t) => ({
      id: t.id,
      ukol: t.title,
      faze: t.parent?.title ?? (t.kind === "phase" ? "(samostatná fáze)" : null),
      slozka: t.subProject?.name ?? null,
      popis: t.description?.slice(0, 300) ?? null,
      dny: t.estimateDays,
      remeslo: t.profession,
      ...(d.replaceExisting ? { puvodni_odhad: t.costEstimate != null ? Number(t.costEstimate) : null } : {}),
    }));
    const { data, costUsd } = await callModel<CostEstimateResult>(
      d.model,
      COST_INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Projekt: ${d.project.name} (${d.project.type})${d.project.description ? ` – ${d.project.description}` : ""}

Úkoly:
${JSON.stringify(list, null, 1)}

Ceník z katalogu (cena za 1 MJ s DPH, materiál + práce):
${priceList}` +
            (d.prompt ? `

Pokyn uživatele: ${d.prompt}` : ""),
        },
      ],
      "costs",
      COST_SCHEMA,
      { effort: "low", maxOutput: 30_000 },
    );
    const known = new Set(cands.map((c) => c.id));
    data.items = data.items.filter((i) => known.has(i.id));
    if (d.replaceExisting)
      data.previous = Object.fromEntries(cands.map((c) => [c.id, c.costEstimate != null ? Number(c.costEstimate) : null]));
    await prisma.planDraft.update({
      where: { id: d.id },
      data: { status: "ready", result: data as unknown as Prisma.InputJsonValue, costUsd },
    });
  } catch (err) {
    await prisma.planDraft
      .update({
        where: { id: draftId },
        data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" },
      })
      .catch(() => {});
  }
}

/** Ceník z katalogu pro odhad nákladů: balíčky a úkony s cenou za 1 MJ (výchozí parametry). */
export async function catalogPriceList() {
  const ops = await prisma.operation.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      params: true,
      materials: { include: { material: { select: { id: true, name: true, unit: true, unitPrice: true } } } },
    },
  });
  const perUnit = new Map<string, number>();
  for (const o of ops) {
    const values: Record<string, number> = {};
    for (const p of o.params) values[p.key] = Number(p.defaultValue ?? 1) || 1;
    values.mnozstvi = 100; // při 100 MJ → jednorázové položky se rozpočítají
    const r = calcOperation(
      {
        unit: o.unit,
        quantityFormula: o.quantityFormula,
        laborFormula: o.laborFormula,
        laborRate: o.laborRate != null ? Number(o.laborRate) : null,
        params: o.params.map((p) => ({ key: p.key, defaultValue: p.defaultValue != null ? Number(p.defaultValue) : null })),
        materials: o.materials.map((m) => ({
          materialId: m.material.id,
          name: m.material.name,
          unit: m.material.unit,
          unitPrice: Number(m.material.unitPrice),
          quantityFormula: m.quantityFormula,
          wastePct: m.wastePct != null ? Number(m.wastePct) : null,
        })),
      },
      values,
    );
    perUnit.set(o.id, r.totalCost / 100);
  }
  const pkgs = await prisma.package.findMany({ orderBy: { name: "asc" }, include: { items: true } });
  const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
  const lines = [
    "Balíčky:",
    ...pkgs.map(
      (p) =>
        `- ${p.name}: ${fmt(p.items.reduce((a, it) => a + (perUnit.get(it.operationId) ?? 0) * Number(it.qtyPerUnit), 0))} Kč/${p.unit}` +
        (p.note ? ` (${p.note.slice(0, 120)})` : ""),
    ),
    "Úkony:",
    ...ops.map((o) => `- ${o.name}: ${fmt(perUnit.get(o.id) ?? 0)} Kč/${o.unit}`),
  ];
  return lines.join("\n");
}
