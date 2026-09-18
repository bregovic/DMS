import { prisma } from "@/lib/prisma";
import { REQUEST_FORECAST_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";
import { computeForecastContribs, type ForecastRequestInput } from "@/lib/forecast";

export type ProjectFinance = { income: number; spent: number; forecast: number };

/**
 * Příjmy, výdaje a forecast po projektech.
 *
 * Forecast = co ještě zaplatíme:
 *  - žádanky: cena žádanky, jinak vybraná nabídka, jinak nejlevnější nabídka
 *    (dřív jen žádanky s vyplněnou cenou – bez cen byl forecast prázdný),
 *  - odhady nákladů u úkolů (AI plán / ručně), dokud žádanka k úkolu nemá
 *    cenu ani nabídku a úkol není hotový; u fáze jen, když odhad nemá žádný její úkol,
 *  - minus reálné výdaje navázané na žádanku / úkol (viz computeForecastContribs).
 */
export async function projectFinance(
  projectIds: string[],
  period?: { gte?: Date; lte?: Date },
): Promise<Map<string, ProjectFinance>> {
  const out = new Map<string, ProjectFinance>(projectIds.map((id) => [id, { income: 0, spent: 0, forecast: 0 }]));
  if (projectIds.length === 0) return out;
  const dateWhere = period && (period.gte || period.lte) ? { date: period } : {};

  const [exp, inc, reqs, tasks, taskExp] = await Promise.all([
    prisma.expense.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, ...dateWhere },
      _sum: { amount: true },
    }),
    prisma.income.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, ...dateWhere },
      _sum: { amount: true },
    }),
    prisma.request.findMany({
      where: { projectId: { in: projectIds }, status: { in: REQUEST_FORECAST_STATUSES } },
      select: {
        projectId: true,
        price: true,
        taskId: true,
        subProjectId: true,
        expenses: { select: { amount: true } },
        offers: { select: { price: true, selected: true } },
      },
    }),
    prisma.task.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        id: true,
        projectId: true,
        parentId: true,
        subProjectId: true,
        status: true,
        costEstimate: true,
      },
    }),
    prisma.expense.findMany({
      where: { projectId: { in: projectIds }, taskId: { not: null } },
      select: { taskId: true, amount: true },
    }),
  ]);

  for (const e of exp) out.get(e.projectId)!.spent = Number(e._sum.amount ?? 0);
  for (const i of inc) out.get(i.projectId)!.income = Number(i._sum.amount ?? 0);

  const realByTask = new Map<string, number>();
  for (const e of taskExp)
    if (e.taskId) realByTask.set(e.taskId, (realByTask.get(e.taskId) ?? 0) + Number(e.amount));

  // Fáze, jejichž některý úkol má vlastní odhad → odhad fáze se nepočítá (dvakrát).
  const kidHasEstimate = new Set(tasks.filter((t) => t.parentId && t.costEstimate != null).map((t) => t.parentId!));

  for (const pid of projectIds) {
    const inputs: ForecastRequestInput[] = [];
    const pricedTasks = new Set<string>();
    for (const r of reqs) {
      if (r.projectId !== pid) continue;
      const priced = r.offers.filter((o) => o.price != null);
      const chosen = priced.find((o) => o.selected);
      const cheapest = priced.sort((a, b) => Number(a.price) - Number(b.price))[0];
      const price = r.price ?? chosen?.price ?? cheapest?.price ?? null;
      if (price == null) continue;
      if (r.taskId) pricedTasks.add(r.taskId);
      inputs.push({
        price: Number(price),
        taskId: r.taskId,
        subId: r.subProjectId,
        realOnRequest: r.expenses.reduce((a, e) => a + Number(e.amount), 0),
      });
    }
    const ptasks = tasks.filter((t) => t.projectId === pid);
    for (const t of ptasks) {
      // Odhad platí, dokud žádanka k úkolu nemá cenu (ani nabídku).
      if (t.costEstimate == null || pricedTasks.has(t.id)) continue;
      if (TASK_DONE_STATUSES.includes(t.status)) continue;
      if (kidHasEstimate.has(t.id)) continue;
      inputs.push({ price: Number(t.costEstimate), taskId: t.id, subId: t.subProjectId, realOnRequest: 0 });
    }
    out.get(pid)!.forecast = computeForecastContribs(
      inputs,
      ptasks.map((t) => ({ id: t.id, parentId: t.parentId })),
      realByTask,
    ).reduce((s, c) => s + c.amount, 0);
  }
  return out;
}
