import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ProjectIcon } from "@/components/projects/project-icon";
import { formatCurrency, formatDate } from "@/lib/utils";
import { categoryLabel } from "@/lib/constants";

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
        take: 6,
        include: { project: true },
      }),
      prisma.project.findMany({
        where: { ownerId: user.id },
        include: { _count: { select: { expenses: true, documents: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

  const totalSpent = Number(expenseAgg._sum.amount ?? 0);

  const stats = [
    { label: "Projekty", value: String(projectCount) },
    { label: "Celkové výdaje", value: formatCurrency(totalSpent) },
    { label: "Záznamů", value: String(expenseAgg._count) },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Statistiky – řádek s hairline oddělovači */}
      <div className="mb-12 grid grid-cols-1 border-y border-stone-300/80 sm:grid-cols-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`py-6 sm:px-6 ${
              i > 0 ? "border-t border-stone-200 sm:border-t-0 sm:border-l" : ""
            } ${i === 0 ? "sm:pl-0" : ""}`}
          >
            <p className="kicker">{s.label}</p>
            <p className="display mt-2 text-3xl text-stone-950">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        {/* Projekty */}
        <section>
          <div className="mb-4 flex items-baseline justify-between border-b border-stone-300/80 pb-2">
            <h2 className="kicker">Projekty</h2>
            <Link
              href="/projects"
              className="text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
            >
              Všechny
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">
              Zatím nemáš žádné projekty.{" "}
              <Link href="/projects" className="text-stone-950 underline underline-offset-4">
                Vytvoř první
              </Link>
              .
            </p>
          ) : (
            <ul>
              {projects.map((p) => (
                <li key={p.id} className="border-b border-stone-200">
                  <Link
                    href={`/projects/${p.id}`}
                    className="group flex items-center gap-4 py-3.5"
                  >
                    <ProjectIcon
                      type={p.type}
                      className="size-5 shrink-0 text-stone-700"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-950">
                        {p.name}
                      </p>
                      <p className="kicker mt-0.5">
                        {p._count.expenses} výdajů · {p._count.documents} dok.
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 text-stone-300 transition-colors group-hover:text-stone-950" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Poslední výdaje */}
        <section>
          <div className="mb-4 border-b border-stone-300/80 pb-2">
            <h2 className="kicker">Poslední výdaje</h2>
          </div>
          {recentExpenses.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">Zatím žádné výdaje.</p>
          ) : (
            <ul>
              {recentExpenses.map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-3 border-b border-stone-200 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-950">
                      {e.title}
                    </p>
                    <p className="kicker mt-0.5">
                      {e.project.name} · {categoryLabel(e.category)} ·{" "}
                      {formatDate(e.date)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-stone-950">
                    {formatCurrency(Number(e.amount), e.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
