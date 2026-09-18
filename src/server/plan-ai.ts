import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";
import { AI_MODEL, assertBudget, callModel, extractable, filePart } from "@/server/extraction";

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
- tasks: konkrétní úkoly ve fázi v pořadí provádění. Kde odpovídá úkon z katalogu, dej jeho operationCode a množství (quantity, unit) z výkresů/výkazů. estimateDays = pracovní dny party; technologické přestávky (zrání betonu, vysychání) jako samostatný úkol.
- costEstimate: odhad nákladů úkolu v Kč s DPH (materiál + práce, ceny ČR 2026). Když nejde odhadnout, null.
- procurement: když se na úkol typicky poptává dodavatel nebo materiál (okna, střecha, elektro, beton, lešení…), krátký text co poptat vč. hlavních parametrů (rozměry, množství); jinak null.
- profession: řemeslo (Zedník, Tesař, Elektrikář…).
- summary 2–4 věty česky; assumptions: z čeho vycházíš; missingInfo: co v dokumentaci chybí a zpřesnilo by plán.
- totalCost a durationDays: součet a celková délka v pracovních dnech.
Nevymýšlej rozměry, které v dokumentaci nejsou – pak dej quantity null a zmiň to v missingInfo. Pokyn uživatele má přednost.`;

/** Dokumenty projektu, které AI umí přečíst (pro výběr v dialogu). */
export async function planDocuments(projectId: string) {
  const docs = await prisma.document.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, originalName: true, mimeType: true, size: true, type: true, requestId: true },
  });
  return docs.filter((d) => extractable(d.mimeType, d.originalName));
}

export async function createPlanDraft(projectId: string, userId: string, documentIds: string[], prompt?: string | null) {
  await assertBudget(userId);
  const busy = await prisma.planDraft.findFirst({ where: { projectId, status: "running" }, select: { id: true } });
  if (busy) throw new Error("AI už na plánu projektu pracuje – počkej, až doběhne.");
  const allowed = new Set((await planDocuments(projectId)).map((d) => d.id));
  const ids = documentIds.filter((id) => allowed.has(id)).slice(0, 10);
  const d = await prisma.planDraft.create({
    data: { projectId, documentIds: ids, prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
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
        project: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
            startDate: true,
            plannedEnd: true,
            ownerId: true,
            tasks: { select: { title: true, kind: true, status: true }, take: 300 },
          },
        },
      },
    });
    if (!d) return;
    const p = d.project;

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
      { effort: "medium", maxOutput: 40_000 },
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
  const [vendorSelection, costDraft, unestimated] = await Promise.all([
    vendorSelectionCandidates(projectId).then((c) => c.length),
    prisma.planDraft.findFirst({
      where: { projectId, kind: "costs", status: { in: ["running", "ready", "error"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, error: true },
    }),
    costCandidates(projectId).then((c) => c.length),
  ]);
  return {
    projectId,
    docs: docs.map((d) => ({ id: d.id, name: d.originalName })),
    draft,
    procurable,
    vendorSelection,
    costDraft,
    unestimated,
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
Když opravdu nejde odhadnout, null. note: krátce z čeho odhad vychází (max ~10 slov).
summary: 1–2 věty – celkový odhad a hlavní nejistoty. Vrať položku pro každé zadané id. Pokyn uživatele má přednost.`;

/** Úkoly bez odhadu nákladů, které ještě nejsou hotové (a fáze bez úkolů). */
export async function costCandidates(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, kind: { in: ["task", "phase"] }, costEstimate: null, status: { notIn: ["done", "cancelled"] } },
    select: {
      id: true,
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

export async function createCostDraft(projectId: string, userId: string, prompt?: string | null) {
  await assertBudget(userId);
  const busy = await prisma.planDraft.findFirst({ where: { projectId, status: "running" }, select: { id: true } });
  if (busy) throw new Error("AI už na plánu projektu pracuje – počkej, až doběhne.");
  const n = (await costCandidates(projectId)).length;
  if (n === 0) throw new Error("Všechny nehotové úkoly už odhad nákladů mají.");
  const d = await prisma.planDraft.create({
    data: { projectId, kind: "costs", documentIds: [], prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return d.id;
}

export async function runCostDraft(draftId: string) {
  try {
    const d = await prisma.planDraft.findUnique({
      where: { id: draftId },
      select: { id: true, model: true, prompt: true, project: { select: { id: true, name: true, type: true, description: true } } },
    });
    if (!d) return;
    const cands = (await costCandidates(d.project.id)).slice(0, 250);
    const list = cands.map((t) => ({
      id: t.id,
      ukol: t.title,
      faze: t.parent?.title ?? (t.kind === "phase" ? "(samostatná fáze)" : null),
      slozka: t.subProject?.name ?? null,
      popis: t.description?.slice(0, 300) ?? null,
      dny: t.estimateDays,
      remeslo: t.profession,
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
${JSON.stringify(list, null, 1)}` +
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
