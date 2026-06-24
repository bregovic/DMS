import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ProjectIcon } from "@/components/projects/project-icon";
import { QuickAdd } from "@/components/app/quick-add";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getExpenseCategoryMap, getExpenseCategories } from "@/server/expense-categories";
import { getDocumentTypes } from "@/server/document-types";
import { getStatuses } from "@/server/statuses";

export default async function DashboardPage() {
  const user = await requireUser();

  const [
    projectCount,
    expenseAgg,
    incomeAgg,
    recentExpenses,
    projects,
    catMap,
    allProjects,
    vendorRows,
    categories,
    docTypes,
    expenseStatuses,
    taskStatuses,
  ] = await Promise.all([
    prisma.project.count({ where: { ownerId: user.id } }),
    prisma.expense.aggregate({
      where: { project: { ownerId: user.id } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.income.aggregate({
      where: { project: { ownerId: user.id } },
      _sum: { amount: true },
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
    getExpenseCategoryMap(),
    prisma.project.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hourlyRate: true },
    }),
    getExpenseCategories(),
    getDocumentTypes(),
    getStatuses("expense"),
    getStatuses("task"),
  ]);
  const quickVendors = vendorRows.map((v) => ({
    id: v.id,
    name: v.name,
    hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
  }));

  // Subprojekty vlastníka pro výběr složky v rychlém přidání (s odsazením dle vnoření)
  const subRows = await prisma.subProject.findMany({
    where: { project: { ownerId: user.id } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, projectId: true, parentId: true },
  });
  const subsByProject: Record<string, { id: string; name: string }[]> = {};
  {
    const byProj = new Map<string, typeof subRows>();
    for (const s of subRows) {
      const a = byProj.get(s.projectId) ?? [];
      a.push(s);
      byProj.set(s.projectId, a);
    }
    for (const [pid, list] of byProj) {
      const byId = new Map(list.map((s) => [s.id, s]));
      const depth = (id: string) => {
        let d = 0;
        let cur = byId.get(id);
        while (cur?.parentId) {
          d++;
          cur = byId.get(cur.parentId);
        }
        return d;
      };
      subsByProject[pid] = list.map((s) => ({
        id: s.id,
        name: `${"– ".repeat(depth(s.id))}${s.name}`,
      }));
    }
  }

  const totalSpent = Number(expenseAgg._sum.amount ?? 0);
  const totalIncome = Number(incomeAgg._sum.amount ?? 0);
  const saldo = totalIncome - totalSpent;

  const stats = [
    { label: "Projekty", value: String(projectCount), className: "text-stone-950" },
    { label: "Celkové příjmy", value: formatCurrency(totalIncome), className: "text-stone-950" },
    { label: "Celkové výdaje", value: formatCurrency(totalSpent), className: "text-stone-950" },
    {
      label: "Saldo",
      value: formatCurrency(saldo),
      className: saldo < 0 ? "text-red-600" : "text-emerald-700",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <QuickAdd
        projects={allProjects}
        subsByProject={subsByProject}
        vendors={quickVendors}
        categories={categories}
        docTypes={docTypes}
        expenseStatuses={expenseStatuses}
        taskStatuses={taskStatuses}
      />

      {/* Statistiky – karty s jemným stínem */}
      <div className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="border border-stone-200 bg-white px-6 py-6 shadow-soft"
          >
            <p className="kicker">{s.label}</p>
            <p className={`display mt-2 text-3xl ${s.className}`}>{s.value}</p>
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
                      {e.project.name} · {catMap.get(e.category) ?? e.category} ·{" "}
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
