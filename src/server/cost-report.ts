import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { REQUEST_FORECAST_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";
import { computeForecastContribs, type ForecastRequestInput } from "@/lib/forecast";
import { getExpenseCategoryMap } from "@/server/expense-categories";
import { AI_MODEL, aiAccountForProject, assertBudget, callModel } from "@/server/extraction";
import { catalogPriceList } from "@/server/plan-ai";

/**
 * Report nákladů projektu / složky (#48).
 *
 * Podklady (součty, měsíce, dodavatelé, zbývající forecast, stav fází) se
 * spočítají z dat a uloží jako snímek. Model k nim dodá jen to, co z dat
 * jednoznačně nevyplývá: rozřazení výdajů do celků a druhů (kategorie bývají
 * vyplněné nejednotně), srovnání s cenami trhu, realistické pásmo zbytku
 * a komentář. Součty z jeho rozřazení se počítají zase u nás.
 */

export const REPORT_KINDS = ["prace", "material", "stroje", "projekt", "rezie"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportExpense = {
  key: string;
  date: string;
  title: string;
  vendor: string | null;
  amount: number;
  paid: boolean;
  category: string;
  task: string | null;
  phase: string | null;
  hours: number | null;
  rate: number | null;
};

export type ReportForecastItem = {
  key: string;
  title: string;
  phase: string | null;
  vendor: string | null;
  note: string | null;
  amount: number;
};

export type ReportData = {
  generatedAt: string;
  projectName: string;
  projectType: string;
  scopeName: string;
  description: string | null;
  budget: number | null;
  expenses: ReportExpense[];
  forecast: ReportForecastItem[];
  phases: { title: string; done: number; total: number; start: string | null; end: string | null }[];
};

export type ReportResult = {
  groups: string[];
  assign: { key: string; group: string; kind: ReportKind; activity: string | null }[];
  activities: { vendor: string; activity: string; plan: number | null; note: string | null }[];
  forecastAssign: { key: string; group: string }[];
  forecastBands: { group: string; low: number; high: number; note: string }[];
  comparisons: { item: string; ours: string; market: string; verdict: "good" | "ok" | "check" | "bad"; note: string | null }[];
  summary: { tone: "good" | "warn" | "info"; title: string; text: string }[];
  recommendations: string[];
  assumptions: string | null;
};

const d10 = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Složka + všechny její podsložky (null = celý projekt). */
async function scopeSubIds(projectId: string, subProjectId: string | null): Promise<string[] | null> {
  if (!subProjectId) return null;
  const subs = await prisma.subProject.findMany({ where: { projectId }, select: { id: true, parentId: true } });
  const out = [subProjectId];
  for (let i = 0; i < out.length; i++) for (const s of subs) if (s.parentId === out[i]) out.push(s.id);
  return out;
}

/** Snímek dat pro report. */
export async function collectReportData(projectId: string, subProjectId: string | null): Promise<ReportData> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true, type: true, description: true },
  });
  const sub = subProjectId
    ? await prisma.subProject.findUnique({ where: { id: subProjectId }, select: { name: true, description: true, budget: true } })
    : null;
  const ids = await scopeSubIds(projectId, subProjectId);
  const inScope = ids ? { subProjectId: { in: ids } } : {};

  const [expenses, tasks, requests, catMap] = await Promise.all([
    prisma.expense.findMany({
      where: { projectId, ...inScope },
      orderBy: { date: "asc" },
      select: {
        id: true, date: true, title: true, amount: true, stage: true, category: true, hours: true, rate: true,
        taskId: true, requestId: true,
        vendor: { select: { name: true } },
        task: { select: { title: true, parent: { select: { title: true } } } },
      },
    }),
    prisma.task.findMany({
      where: { projectId, ...inScope },
      select: {
        id: true, parentId: true, kind: true, title: true, status: true, costEstimate: true, description: true,
        subProjectId: true, startDate: true, dueDate: true,
        vendor: { select: { name: true } },
        parent: { select: { title: true } },
      },
    }),
    prisma.request.findMany({
      where: { projectId, ...inScope, status: { in: REQUEST_FORECAST_STATUSES } },
      select: {
        id: true, title: true, price: true, taskId: true, subProjectId: true,
        vendor: { select: { name: true } },
        task: { select: { title: true, parent: { select: { title: true } } } },
        offers: { select: { price: true, selected: true } },
      },
    }),
    getExpenseCategoryMap(),
  ]);

  // Zbývající forecast stejně jako v přehledu projektu (žádanky + odhady úkolů − navázané výdaje).
  const realByTask = new Map<string, number>();
  const realByReq = new Map<string, number>();
  for (const e of expenses) {
    const a = Number(e.amount);
    if (e.taskId) realByTask.set(e.taskId, (realByTask.get(e.taskId) ?? 0) + a);
    else if (e.requestId) realByReq.set(e.requestId, (realByReq.get(e.requestId) ?? 0) + a);
  }
  const reqPrice = (r: (typeof requests)[number]) => {
    if (r.price != null) return Number(r.price);
    const priced = r.offers.filter((o) => o.price != null);
    const chosen = priced.find((o) => o.selected) ?? [...priced].sort((x, y) => Number(x.price) - Number(y.price))[0];
    return chosen ? Number(chosen.price) : null;
  };
  const inputs: ForecastRequestInput[] = [];
  for (const r of requests) {
    const p = reqPrice(r);
    if (p == null) continue;
    inputs.push({ price: p, taskId: r.taskId, subId: r.subProjectId, realOnRequest: realByReq.get(r.id) ?? 0, ref: r.id });
  }
  const tasksWithReq = new Set(requests.filter((r) => reqPrice(r) != null).map((r) => r.taskId).filter(Boolean));
  const kidHasEstimate = new Set(tasks.filter((t) => t.parentId && t.costEstimate != null).map((t) => t.parentId));
  for (const t of tasks)
    if (t.costEstimate != null && !tasksWithReq.has(t.id) && !TASK_DONE_STATUSES.includes(t.status) && !kidHasEstimate.has(t.id))
      inputs.push({ price: Number(t.costEstimate), taskId: t.id, subId: t.subProjectId, realOnRequest: 0 });
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const reqById = new Map(requests.map((r) => [r.id, r]));
  const forecast: ReportForecastItem[] = [];
  computeForecastContribs(inputs, tasks.map((t) => ({ id: t.id, parentId: t.parentId })), realByTask).forEach((c, i) => {
    const t = c.taskId ? taskById.get(c.taskId) : null;
    const r = !t && c.ref ? reqById.get(c.ref) : null;
    forecast.push({
      key: `f${i + 1}`,
      title: t?.title ?? r?.title ?? "Žádanka",
      phase: t ? (t.parent?.title ?? (t.kind === "phase" ? t.title : null)) : (r?.task?.parent?.title ?? null),
      vendor: t?.vendor?.name ?? r?.vendor?.name ?? null,
      note: t?.description ? t.description.slice(-240) : null,
      amount: Math.round(c.amount),
    });
  });

  // Stav fází: hotové / všechny úkoly (bez zrušených); úkoly bez fáze zvlášť.
  const phases: ReportData["phases"] = [];
  const kids = new Map<string, typeof tasks>();
  for (const t of tasks) if (t.parentId && t.kind !== "todo") kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  for (const p of tasks.filter((t) => t.kind === "phase")) {
    const k = (kids.get(p.id) ?? []).filter((t) => t.status !== "cancelled");
    if (!k.length) continue;
    phases.push({
      title: p.title.replace(/\s+/g, " ").trim(),
      done: k.filter((t) => t.status === "done").length,
      total: k.length,
      start: d10(p.startDate),
      end: d10(p.dueDate),
    });
  }
  phases.sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999"));

  return {
    generatedAt: new Date().toISOString(),
    projectName: project.name,
    projectType: project.type,
    scopeName: sub?.name ?? project.name,
    description: sub?.description ?? project.description ?? null,
    budget: sub?.budget != null ? Number(sub.budget) : null,
    expenses: expenses.map((e, i) => ({
      key: `e${i + 1}`,
      date: d10(e.date)!,
      title: e.title,
      vendor: e.vendor?.name ?? null,
      amount: Number(e.amount),
      paid: e.stage === "uhrazeno",
      category: catMap.get(e.category) ?? e.category,
      task: e.task?.title ?? null,
      phase: e.task?.parent?.title ?? null,
      hours: e.hours != null ? Number(e.hours) : null,
      rate: e.rate != null ? Number(e.rate) : null,
    })),
    forecast,
    phases,
  };
}

// ---------------------------------------------------------------------------
// Rozřazení a komentář
// ---------------------------------------------------------------------------

const n = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const arr = (items: unknown) => ({ type: "array", items });
const S = { type: "string" };

const SCHEMA = obj({
  groups: arr(S),
  assign: arr(obj({ key: S, group: S, kind: { type: "string", enum: [...REPORT_KINDS] }, activity: str })),
  activities: arr(obj({ vendor: S, activity: S, plan: n, note: str })),
  forecastAssign: arr(obj({ key: S, group: S })),
  forecastBands: arr(obj({ group: S, low: { type: "number" }, high: { type: "number" }, note: S })),
  comparisons: arr(obj({ item: S, ours: S, market: S, verdict: { type: "string", enum: ["good", "ok", "check", "bad"] }, note: str })),
  summary: arr(obj({ tone: { type: "string", enum: ["good", "warn", "info"] }, title: S, text: S })),
  recommendations: arr(S),
  assumptions: str,
});

const INSTRUCTIONS = `Jsi rozpočtář a stavbyvedoucí v Česku. Dostaneš výdaje stavby (projektu nebo jeho složky), zbývající plánované náklady a stav fází. Připrav podklady pro report nákladů. Piš česky, věcně, bez slova „AI“.

1) groups: 6–12 stavebních celků podle toho, co se na stavbě reálně dělá (např. Základy a deska, Hrubá stavba 1. NP, Strop, Střecha a krov, Fasáda a zateplení, Okna a výplně, Instalace, Interiér, Lešení, Projekt a povolení, Režie stavby). Seřaď je podle postupu stavby.
2) assign: KAŽDÝ výdaj (key) přiřaď do jednoho celku z groups a druhu:
   prace = práce řemeslníků a pomocníků (i když je v kategorii „materiál“ – rozhoduje dodavatel a popis; řemeslník placený po dnech je práce),
   material = materiál a výrobky, stroje = pronájem strojů, lešení, bednění, kontejnery, doprava, čerpadlo betonu,
   projekt = projekt, statik, geodet, poplatky, rezie = palivo, nářadí, drobná režie.
   Celek odvoď z popisu, úkolu/fáze, dodavatele a DATA (výdaje bez úkolu patří k tomu, co se v tu dobu stavělo – podle fází a sousedních výdajů).
   activity: u druhu prace krátký název činnosti (např. „Zdění 2. NP“, „Věnec 2. NP“, „Úklid a manipulace“), jinak null.
3) activities: pro dodavatele práce a jejich činnosti uveď plán v Kč, pokud ho lze vyčíst z plánu (odhady hotových i nehotových úkolů, popisy „X dní × sazba“), jinak null. note: krátký postřeh (pomalé tempo, práce, kterou by levněji udělal pomocník, souběh dvou part…), jinak null. NEPOČÍTEJ součty – sečteme je sami.
4) forecastAssign: každou zbývající položku (key f…) přiřaď do celku (můžeš použít i celky, které ve výdajích zatím nejsou, např. Energie, Koupelna, Terasa – přidej je do groups).
   forecastBands: pro každý celek se zbývajícími náklady realistické pásmo low–high v Kč s DPH podle cen trhu ČR 2026. Když plán zjevně chybí nebo je jen za práci (materiál chybí), pásmo to zohlední. note: co v tom je, max 15 slov.
5) comparisons: 5–10 srovnání jednotkových cen s trhem jen tam, kde z dat jde zjistit množství (m³ betonu, m² zateplení z faktury, sazba za den, Kč/m² plochy…). V „ours“ ukaž výpočet (např. „69 212 Kč / 22 m³ = 3 146 Kč/m³“). Trh: ceník z katalogu (ceny s DPH), jinak obvyklé ceny ČR 2026 se zdrojem. Nevymýšlej množství – když je odhaduješ, napiš „odhad“. verdict: good = levněji než trh, ok = na úrovni trhu, check = nelze rozhodnout / ověřit, bad = dráž.
6) summary: 4–6 hlavních zjištění (tone good/warn/info, nadpis do 6 slov, text 1–2 věty s čísly).
7) recommendations: 3–6 konkrétních doporučení.
8) assumptions: z čeho vycházíš (plochy, sazby, pokyn uživatele), 1–2 věty.
Pokyn uživatele má přednost.`;

export async function createCostReport(projectId: string, subProjectId: string | null, userId: string, prompt: string | null) {
  const account = await aiAccountForProject(projectId);
  await assertBudget(account);
  const busy = await prisma.costReport.findFirst({
    where: { projectId, status: "running", createdAt: { gte: new Date(Date.now() - 25 * 60_000) } },
    select: { id: true },
  });
  if (busy) throw new Error("Report se už připravuje – počkej, až doběhne.");
  const r = await prisma.costReport.create({
    data: { projectId, subProjectId, prompt: prompt?.trim() || null, model: AI_MODEL, createdById: userId },
    select: { id: true },
  });
  return r.id;
}

export async function runCostReport(reportId: string) {
  try {
    const r = await prisma.costReport.findUnique({ where: { id: reportId } });
    if (!r) return;
    const data = await collectReportData(r.projectId, r.subProjectId);
    await prisma.costReport.update({ where: { id: r.id }, data: { data: data as unknown as Prisma.InputJsonValue } });
    if (data.expenses.length === 0 && data.forecast.length === 0) {
      await prisma.costReport.update({ where: { id: r.id }, data: { status: "error", error: "Ve složce nejsou žádné výdaje ani plánované náklady." } });
      return;
    }
    const priceList = await catalogPriceList();
    const vstup = {
      projekt: `${data.projectName}${data.scopeName !== data.projectName ? ` / ${data.scopeName}` : ""} (${data.projectType})`,
      popis: data.description,
      rozpocet: data.budget,
      vydaje: data.expenses.map((e) => ({
        key: e.key, datum: e.date, popis: e.title, dodavatel: e.vendor, castka: e.amount, kategorie: e.category,
        ukol: e.task, faze: e.phase, ...(e.hours ? { hodiny: e.hours, sazba: e.rate } : {}),
      })),
      zbyva: data.forecast.map((f) => ({ key: f.key, polozka: f.title, faze: f.phase, dodavatel: f.vendor, castka: f.amount, popis: f.note })),
      faze: data.phases.map((p) => `${p.title}: ${p.done}/${p.total} hotovo (${p.start ?? "?"} – ${p.end ?? "?"})`),
    };
    const account = await aiAccountForProject(r.projectId);
    const { data: res, costUsd } = await callModel<ReportResult>(
      r.model,
      INSTRUCTIONS,
      [
        {
          type: "input_text",
          text:
            `Podklady:\n${JSON.stringify(vstup)}\n\nCeník z katalogu (cena za 1 MJ s DPH, materiál + práce):\n${priceList}` +
            (r.prompt ? `\n\nPokyn uživatele: ${r.prompt}` : ""),
        },
      ],
      "cost_report",
      SCHEMA,
      { effort: "low", maxOutput: 40_000, webSearch: true, account },
    );
    await prisma.costReport.update({
      where: { id: r.id },
      data: { status: "ready", result: normalize(res, data) as unknown as Prisma.InputJsonValue, costUsd },
    });
  } catch (err) {
    await prisma.costReport
      .update({ where: { id: reportId }, data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "Neznámá chyba" } })
      .catch(() => {});
  }
}

/** Pojistky nad výstupem modelu: neznámé klíče pryč, chybějící výdaje do „Ostatní“. */
function normalize(res: ReportResult, data: ReportData): ReportResult {
  const groups = [...new Set(res.groups.map((g) => g.trim()).filter(Boolean))];
  const ensure = (g: string) => {
    const t = g.trim() || "Ostatní";
    if (!groups.includes(t)) groups.push(t);
    return t;
  };
  const eKeys = new Set(data.expenses.map((e) => e.key));
  const seen = new Set<string>();
  const assign = res.assign
    .filter((a) => eKeys.has(a.key) && !seen.has(a.key) && seen.add(a.key))
    .map((a) => ({ ...a, group: ensure(a.group), kind: REPORT_KINDS.includes(a.kind) ? a.kind : "material" }));
  for (const e of data.expenses) if (!seen.has(e.key)) assign.push({ key: e.key, group: ensure("Ostatní"), kind: "material", activity: null });
  const fKeys = new Set(data.forecast.map((f) => f.key));
  const fSeen = new Set<string>();
  const forecastAssign = res.forecastAssign
    .filter((a) => fKeys.has(a.key) && !fSeen.has(a.key) && fSeen.add(a.key))
    .map((a) => ({ key: a.key, group: ensure(a.group) }));
  for (const f of data.forecast) if (!fSeen.has(f.key)) forecastAssign.push({ key: f.key, group: ensure(f.phase ?? "Ostatní") });
  const forecastBands = res.forecastBands
    .filter((b) => b.high >= 0)
    .map((b) => ({ ...b, group: ensure(b.group), low: Math.max(0, Math.min(b.low, b.high)), high: Math.max(b.low, b.high) }));
  return { ...res, groups, assign, forecastAssign, forecastBands };
}
