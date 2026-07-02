import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ProjectIcon } from "@/components/projects/project-icon";
import { QuickAdd } from "@/components/app/quick-add";
import { formatCurrency, formatDate } from "@/lib/utils";
import { REQUEST_FORECAST_STATUSES } from "@/lib/constants";
import { computeForecastContribs } from "@/lib/forecast";
import { getExpenseCategoryMap, getExpenseCategories } from "@/server/expense-categories";
import { getDocumentTypes } from "@/server/document-types";
import { getStatuses } from "@/server/statuses";
import { listProjectsForUser, canWrite } from "@/server/access";

export default async function DashboardPage() {
  const user = await requireUser();

  // Projekty s přístupem (vlastní + pozvané) – aby i pozvaný dodavatel mohl
  // rychle přidat výdaj a viděl „svůj" projekt (bez vlastního projektu = prázdno).
  const accessible = await listProjectsForUser(user);
  const writable = accessible.filter((a) => canWrite(a.role));
  const writableProjects = writable.map((a) => ({
    id: a.project.id,
    name: a.project.name,
  }));
  const writableIds = writable.map((a) => a.project.id);
  const projectsList = accessible.slice(0, 5).map((a) => a.project);

  const [
    expenseAgg,
    incomeAgg,
    forecastReqs,
    recentExpenses,
    catMap,
    vendorRows,
    categories,
    docTypes,
    expenseStatuses,
    taskStatuses,
    fcTaskRows,
    fcTaskExpenses,
  ] = await Promise.all([
    prisma.expense.aggregate({
      where: { project: { ownerId: user.id } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.income.aggregate({
      where: { project: { ownerId: user.id } },
      _sum: { amount: true },
    }),
    prisma.request.findMany({
      where: {
        project: { ownerId: user.id },
        status: { in: REQUEST_FORECAST_STATUSES },
        price: { not: null },
      },
      select: { price: true, taskId: true, subProjectId: true, expenses: { select: { amount: true } } },
    }),
    prisma.expense.findMany({
      where: { project: { ownerId: user.id } },
      orderBy: { date: "desc" },
      take: 6,
      include: { project: true },
    }),
    getExpenseCategoryMap(),
    prisma.vendor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, hourlyRate: true },
    }),
    getExpenseCategories(),
    getDocumentTypes(),
    getStatuses("expense"),
    getStatuses("task"),
    prisma.task.findMany({ where: { project: { ownerId: user.id } }, select: { id: true, parentId: true } }),
    prisma.expense.findMany({ where: { project: { ownerId: user.id }, taskId: { not: null } }, select: { taskId: true, amount: true } }),
  ]);
  const quickVendors = vendorRows.map((v) => ({
    id: v.id,
    name: v.name,
    hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
  }));

  // Dodavatel se stejným e-mailem jako přihlášený → předvyplní se u výdaje.
  const myEmail = user.email?.toLowerCase();
  const myVendorId = myEmail
    ? vendorRows.find((v) => v.email?.toLowerCase() === myEmail)?.id
    : undefined;

  // Subprojekty přístupných projektů pro výběr složky (s odsazením dle vnoření)
  const subRows = await prisma.subProject.findMany({
    where: { projectId: { in: writableIds } },
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
  // Forecast: zbývající výdaje potvrzených žádanek (cena − navázané reálné výdaje),
  // s roll-up offsetem výdajů navázaných na úkol/fázi přes celý podstrom.
  const realByTask = new Map<string, number>();
  for (const e of fcTaskExpenses) {
    if (!e.taskId) continue;
    realByTask.set(e.taskId, (realByTask.get(e.taskId) ?? 0) + Number(e.amount));
  }
  const totalForecast = computeForecastContribs(
    forecastReqs.map((r) => ({
      price: Number(r.price ?? 0),
      taskId: r.taskId,
      subId: r.subProjectId,
      realOnRequest: r.expenses.reduce((a, e) => a + Number(e.amount), 0),
    })),
    fcTaskRows.map((t) => ({ id: t.id, parentId: t.parentId })),
    realByTask,
  ).reduce((s, c) => s + c.amount, 0);
  const expectedSaldo = totalIncome - totalSpent - totalForecast;

  const stats = [
    { label: "Projekty", value: String(accessible.length), className: "text-stone-950" },
    { label: "Celkové příjmy", value: formatCurrency(totalIncome), className: "text-stone-950" },
    { label: "Celkové výdaje", value: formatCurrency(totalSpent), className: "text-stone-950" },
    {
      label: "Forecast výdajů",
      value: formatCurrency(totalForecast),
      className: "text-amber-600",
    },
    {
      label: "Saldo",
      value: formatCurrency(saldo),
      className: saldo < 0 ? "text-red-600" : "text-emerald-700",
    },
    {
      label: "Oček. saldo",
      value: formatCurrency(expectedSaldo),
      className: expectedSaldo < 0 ? "text-red-600" : "text-emerald-700",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <QuickAdd
        projects={writableProjects}
        subsByProject={subsByProject}
        vendors={quickVendors}
        myVendorId={myVendorId}
        categories={categories}
        docTypes={docTypes}
        expenseStatuses={expenseStatuses}
        taskStatuses={taskStatuses}
      />

      {/* Statistiky – karty s jemným stínem */}
      <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          {projectsList.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">
              Zatím nemáš žádné projekty.{" "}
              <Link href="/projects" className="text-stone-950 underline underline-offset-4">
                Vytvoř první
              </Link>
              .
            </p>
          ) : (
            <ul>
              {projectsList.map((p) => (
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
