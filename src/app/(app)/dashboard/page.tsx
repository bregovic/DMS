import Link from "next/link";
import { ArrowRight, FolderKanban, Receipt, Wallet } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { categoryLabel, projectTypeLabel } from "@/lib/constants";

export default async function DashboardPage() {
  const user = await requireUser();

  const [projectCount, expenseAgg, recentExpenses, projects] =
    await Promise.all([
      prisma.project.count({ where: { ownerId: user.id } }),
      prisma.expense.aggregate({
        where: { project: { ownerId: user.id } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.findMany({
        where: { project: { ownerId: user.id } },
        orderBy: { date: "desc" },
        take: 5,
        include: { project: true },
      }),
      prisma.project.findMany({
        where: { ownerId: user.id },
        include: { _count: { select: { expenses: true, documents: true } } },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
    ]);

  const totalSpent = Number(expenseAgg._sum.amount ?? 0);

  const stats = [
    {
      label: "Projektů",
      value: String(projectCount),
      icon: FolderKanban,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Celkové výdaje",
      value: formatCurrency(totalSpent),
      icon: Wallet,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Záznamů výdajů",
      value: String(expenseAgg._count),
      icon: Receipt,
      color: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Ahoj, {user.name?.split(" ")[0] ?? "vítej"} 👋
        </h1>
        <p className="text-slate-500">Přehled tvých projektů a výdajů</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div
                className={`flex size-11 items-center justify-center rounded-lg ${s.color}`}
              >
                <s.icon className="size-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="text-xl font-semibold text-slate-900">
                  {s.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Projekty */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Projekty</h2>
            <Link
              href="/projects"
              className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
            >
              Vše <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-slate-500">
                Zatím nemáš žádné projekty.{" "}
                <Link href="/projects" className="text-indigo-600 hover:underline">
                  Vytvoř první
                </Link>
                .
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => {
                const t = projectTypeLabel(p.type);
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <Card className="transition-colors hover:border-indigo-300">
                      <CardContent className="flex items-center gap-3 p-4">
                        <span className="text-2xl">{t.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {p._count.expenses} výdajů · {p._count.documents}{" "}
                            dokumentů
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Poslední výdaje */}
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-900">Poslední výdaje</h2>
          {recentExpenses.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-slate-500">
                Zatím žádné výdaje.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y divide-slate-100 p-0">
                {recentExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {e.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {e.project.name} · {categoryLabel(e.category)} ·{" "}
                        {formatDate(e.date)}
                      </p>
                    </div>
                    <span className="ml-3 shrink-0 text-sm font-semibold text-slate-900">
                      {formatCurrency(Number(e.amount), e.currency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
