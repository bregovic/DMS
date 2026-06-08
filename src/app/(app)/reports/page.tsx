import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartLegend,
  MonthlyBarChart,
  ProjectPieChart,
} from "@/components/reports/charts";
import { formatCurrency } from "@/lib/utils";
import { categoryLabel } from "@/lib/constants";

export default async function ReportsPage() {
  const user = await requireUser();

  const expenses = await prisma.expense.findMany({
    where: { project: { ownerId: user.id } },
    select: {
      amount: true,
      category: true,
      date: true,
      project: { select: { name: true } },
    },
  });

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

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
    .map(([cat, total]) => ({ name: categoryLabel(cat), total }))
    .sort((a, b) => b.total - a.total);

  const now = new Date();
  const monthly: { label: string; total: number }[] = [];
  const monthIndex = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(d);
    monthIndex.set(key, monthly.length);
    monthly.push({ label, total: 0 });
  }
  for (const e of expenses) {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = monthIndex.get(key);
    if (idx !== undefined) monthly[idx].total += Number(e.amount);
  }

  if (expenses.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 border-b border-stone-300/80 pb-6">
          <h1 className="display text-4xl text-stone-950">Reporty</h1>
        </header>
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím nejsou žádná data. Přidej výdaje do projektů a uvidíš tu grafy.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-end justify-between border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Reporty</h1>
        <div className="text-right">
          <p className="kicker">Celkové výdaje</p>
          <p className="display mt-1 text-2xl text-stone-950">
            {formatCurrency(total)}
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Výdaje v čase · 12 měsíců</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBarChart data={monthly} />
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
