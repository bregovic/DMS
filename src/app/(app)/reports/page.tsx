import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartLegend, ProjectPieChart } from "@/components/reports/charts";
import { ForecastReport } from "@/components/reports/forecast-report";
import { formatCurrency } from "@/lib/utils";
import { getExpenseCategoryMap } from "@/server/expense-categories";
import { REQUEST_FORECAST_STATUSES } from "@/lib/constants";

export default async function ReportsPage() {
  const user = await requireUser();

  const [expenses, forecastReqs, catMap] = await Promise.all([
    prisma.expense.findMany({
      where: { project: { ownerId: user.id } },
      select: {
        amount: true,
        category: true,
        date: true,
        project: { select: { name: true } },
      },
    }),
    prisma.request.findMany({
      where: {
        project: { ownerId: user.id },
        status: { in: REQUEST_FORECAST_STATUSES },
        price: { not: null },
      },
      select: {
        price: true,
        requiredDate: true,
        expenses: { select: { amount: true } },
      },
    }),
    getExpenseCategoryMap(),
  ]);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  // Forecast: zbývající částka potvrzené žádanky (cena − již navázané reálné
  // výdaje), zařazená podle požadovaného data. Bez data → mimo časovou osu.
  const forecastRows: { date: string; amount: number }[] = [];
  let undatedForecast = 0;
  for (const r of forecastReqs) {
    const price = Number(r.price ?? 0);
    const spent = r.expenses.reduce((s, e) => s + Number(e.amount), 0);
    const remaining = Math.max(0, price - spent);
    if (remaining <= 0) continue;
    if (r.requiredDate) {
      forecastRows.push({
        date: r.requiredDate.toISOString().slice(0, 10),
        amount: remaining,
      });
    } else {
      undatedForecast += remaining;
    }
  }
  const totalForecast =
    forecastRows.reduce((s, r) => s + r.amount, 0) + undatedForecast;

  const actualRows = expenses.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    amount: Number(e.amount),
  }));

  const byProjectMap = new Map<string, number>();
  for (const e of expenses) {
    byProjectMap.set(
      e.project.name,
      (byProjectMap.get(e.project.name) ?? 0) + Number(e.amount),
    );
  }
  const byProject = [...byProjectMap.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const byCategoryMap = new Map<string, number>();
  for (const e of expenses) {
    byCategoryMap.set(
      e.category,
      (byCategoryMap.get(e.category) ?? 0) + Number(e.amount),
    );
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([cat, total]) => ({ name: catMap.get(cat) ?? cat, total }))
    .sort((a, b) => b.total - a.total);

  if (expenses.length === 0 && totalForecast === 0) {
    return (
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 border-b border-stone-300/80 pb-6">
          <h1 className="display text-4xl text-stone-950">Reporty</h1>
        </header>
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím nejsou žádná data. Přidej výdaje nebo potvrzené žádanky a uvidíš
          tu grafy.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Reporty</h1>
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
          <CardContent className="space-y-5">
            <ProjectPieChart data={byProject} />
            <ChartLegend data={byProject} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Podle kategorie</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {byCategory.map((c) => {
                const pct = total > 0 ? (c.total / total) * 100 : 0;
                return (
                  <li key={c.name} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-stone-600">{c.name}</span>
                      <span className="font-mono text-stone-950">
                        {formatCurrency(c.total)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden bg-stone-200">
                      <div
                        className="h-full bg-stone-950"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
