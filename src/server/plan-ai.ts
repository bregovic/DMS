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
  if (busy) throw new Error("Plán se už připravuje.");
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
        select: { fileName: true, originalName: true, mimeType: true },
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
      where: { projectId, status: { in: ["running", "ready", "error"] } },
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
  return { projectId, docs: docs.map((d) => ({ id: d.id, name: d.originalName })), draft, procurable };
}
