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

  // Podle projektu
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

  // Podle kategorie
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

  // Posledních 12 měsíců
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
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Reporty</h1>
        <Card>
          <CardContent className="p-10 text-center text-slate-500">
            Zatím nejsou žádná data. Přidej výdaje do projektů a uvidíš tu
            grafy.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reporty</h1>
        <p className="text-slate-500">
          Celkové výdaje:{" "}
          <span className="font-semibold text-slate-900">
            {formatCurrency(total)}
          </span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Výdaje v čase (posledních 12 měsíců)</CardTitle>
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
          <CardContent className="space-y-4">
            <ProjectPieChart data={byProject} />
            <ChartLegend data={byProject} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Podle kategorie</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {byCategory.map((c) => {
                const pct = total > 0 ? (c.total / total) * 100 : 0;
                return (
                  <li key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{c.name}</span>
                      <span className="font-medium text-slate-900">
                        {formatCurrency(c.total)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
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
