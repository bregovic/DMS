import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForecastReport } from "@/components/reports/forecast-report";
import { formatCurrency } from "@/lib/utils";
import { getExpenseCategoryMap } from "@/server/expense-categories";
import { ProjectSelect } from "@/components/reports/project-select";
import { REQUEST_FORECAST_STATUSES } from "@/lib/constants";

type BreakRow = { name: string; actual: number; forecast: number };

/** Rozpad s pruhem skutečné (tmavá) + forecast (světlá), škálováno k maximu. */
function BreakdownList({ rows }: { rows: BreakRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.actual + r.forecast));
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.name} className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-stone-600">{r.name}</span>
            <span className="font-mono text-stone-950">
              {formatCurrency(r.actual + r.forecast)}
            </span>
          </div>
          <div className="flex h-1.5 overflow-hidden bg-stone-200">
            <div
              className="h-full bg-stone-950"
              style={{ width: `${(r.actual / max) * 100}%` }}
            />
            <div
              className="h-full bg-stone-400"
              style={{ width: `${(r.forecast / max) * 100}%` }}
            />
          </div>
          {(r.actual > 0 || r.forecast > 0) && (
            <div className="flex justify-between text-[11px] text-stone-400">
              <span>Skutečné {formatCurrency(r.actual)}</span>
              <span>Forecast {formatCurrency(r.forecast)}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const projectId = (await searchParams)?.project || null;
  const projectWhere = { ownerId: user.id, ...(projectId ? { id: projectId } : {}) };

  const [projects, expenses, forecastReqs, catMap] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expense.findMany({
      where: { project: projectWhere },
      select: {
        amount: true,
        category: true,
        date: true,
        project: { select: { name: true } },
      },
    }),
    prisma.request.findMany({
      where: {
        project: projectWhere,
        status: { in: REQUEST_FORECAST_STATUSES },
        price: { not: null },
      },
      select: {
        price: true,
        requiredDate: true,
        category: true,
        project: { select: { name: true } },
        expenses: { select: { amount: true } },
      },
    }),
    getExpenseCategoryMap(),
  ]);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  // Skutečné výdaje podle projektu / kategorie.
  const acProject = new Map<string, number>();
  const acCategory = new Map<string, number>();
  for (const e of expenses) {
    acProject.set(e.project.name, (acProject.get(e.project.name) ?? 0) + Number(e.amount));
    acCategory.set(e.category, (acCategory.get(e.category) ?? 0) + Number(e.amount));
  }

  // Forecast: zbývající částka potvrzené žádanky (cena − již navázané reálné
  // výdaje). Pro časovou osu se řadí podle požadovaného data (bez data → mimo
  // osu); do rozpadu podle projektu/kategorie se počítá vždy.
  const forecastRows: { date: string; amount: number }[] = [];
  let undatedForecast = 0;
  const fcProject = new Map<string, number>();
  const fcCategory = new Map<string, number>();
  for (const r of forecastReqs) {
    const price = Number(r.price ?? 0);
    const spent = r.expenses.reduce((s, e) => s + Number(e.amount), 0);
    const remaining = Math.max(0, price - spent);
    if (remaining <= 0) continue;
    if (r.requiredDate) {
      forecastRows.push({ date: r.requiredDate.toISOString().slice(0, 10), amount: remaining });
    } else {
      undatedForecast += remaining;
    }
    fcProject.set(r.project.name, (fcProject.get(r.project.name) ?? 0) + remaining);
    fcCategory.set(r.category, (fcCategory.get(r.category) ?? 0) + remaining);
  }
  const totalForecast =
    forecastRows.reduce((s, r) => s + r.amount, 0) + undatedForecast;

  const actualRows = expenses.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    amount: Number(e.amount),
  }));

  const byProject: BreakRow[] = [...new Set([...acProject.keys(), ...fcProject.keys()])]
    .map((name) => ({ name, actual: acProject.get(name) ?? 0, forecast: fcProject.get(name) ?? 0 }))
    .sort((a, b) => b.actual + b.forecast - (a.actual + a.forecast));

  const byCategory: BreakRow[] = [...new Set([...acCategory.keys(), ...fcCategory.keys()])]
    .map((key) => ({
      name: catMap.get(key) ?? key,
      actual: acCategory.get(key) ?? 0,
      forecast: fcCategory.get(key) ?? 0,
    }))
    .sort((a, b) => b.actual + b.forecast - (a.actual + a.forecast));

  if (expenses.length === 0 && totalForecast === 0) {
    return (
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
          <h1 className="display text-4xl text-stone-950">Reporty</h1>
          <ProjectSelect projects={projects} />
        </header>
        <p className="py-16 text-center text-sm text-stone-500">
          {projectId
            ? "Pro tento projekt zatím nejsou žádná data."
            : "Zatím nejsou žádná data. Přidej výdaje nebo potvrzené žádanky a uvidíš tu grafy."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div className="flex flex-wrap items-end gap-4">
          <h1 className="display text-4xl text-stone-950">Reporty</h1>
          <ProjectSelect projects={projects} />
        </div>
        <div className="flex gap-8">
          <div className="text-right">
            <p className="kicker">Skutečné výdaje</p>
            <p className="display mt-1 text-2xl text-stone-950">
              {formatCurrency(total)}
            </p>
          </div>
          <div className="text-right">
            <p className="kicker">Forecast</p>
            <p className="display mt-1 text-2xl text-stone-500">
              {formatCurrency(totalForecast)}
            </p>
          </div>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Výdaje a forecast v čase</CardTitle>
        </CardHeader>
        <CardContent>
          <ForecastReport
            actual={actualRows}
            forecast={forecastRows}
            undatedForecast={undatedForecast}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Podle projektu</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={byProject} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Podle kategorie</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={byCategory} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
