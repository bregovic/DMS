import Link from "next/link";
import { DateInput } from "@/components/ui/date-input";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ProjectIcon } from "@/components/projects/project-icon";
import { QuickAdd } from "@/components/app/quick-add";
import { formatCurrency, formatDate } from "@/lib/utils";
import { projectFinance } from "@/server/finance";
import { getExpenseCategoryMap, getExpenseCategories } from "@/server/expense-categories";
import { getDocumentTypes } from "@/server/document-types";
import { getStatuses } from "@/server/statuses";
import { listProjectsForUser, canWrite } from "@/server/access";

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const user = await requireUser();

  /* Období pro souhrn nahoře. Bez filtru se počítá všechno, jako dosud. */
  const sp = await searchParams;
  const fromStr = typeof sp?.from === "string" ? sp.from : "";
  const toStr = typeof sp?.to === "string" ? sp.to : "";
  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(toStr) : null;
  if (to) to.setHours(23, 59, 59, 999);
  const periodOk = (d: Date | null) => d && !isNaN(d.getTime());
  const dateWhere =
    periodOk(from) || periodOk(to)
      ? {
          date: {
            ...(periodOk(from) ? { gte: from as Date } : {}),
            ...(periodOk(to) ? { lte: to as Date } : {}),
          },
        }
      : {};
  const periodActive = Object.keys(dateWhere).length > 0;

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

  // Finance po projektech: vlastní a spravované (člen) – dodavatel rozpočet nevidí.
  const financeProjects = accessible.filter((a) => a.role === "owner" || a.role === "member");
  const [
    finance,
    recentExpenses,
    catMap,
    vendorRows,
    categories,
    docTypes,
    expenseStatuses,
    taskStatuses,
  ] = await Promise.all([
    projectFinance(
      financeProjects.map((a) => a.project.id),
      periodActive
        ? { ...(periodOk(from) ? { gte: from as Date } : {}), ...(periodOk(to) ? { lte: to as Date } : {}) }
        : undefined,
    ),
    prisma.expense.findMany({
      where: { project: { ownerId: user.id } },
      orderBy: { date: "desc" },
      take: 6,
      include: { project: true },
    }),
    getExpenseCategoryMap(),
    prisma.vendor.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, hourlyRate: true },
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

  // Dodavatel se stejným e-mailem jako přihlášený → předvyplní se u výdaje.
  const myEmail = user.email?.toLowerCase();
  const myVendorId = myEmail
    ? vendorRows.find((v) => v.email?.toLowerCase() === myEmail)?.id
    : undefined;

  // Subprojekty (pro výběr složky) + našeptávání názvů výdajů – nezávislé, paralelně.
  const [subRows, titleRows] = await Promise.all([
    prisma.subProject.findMany({
      where: { projectId: { in: writableIds } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, projectId: true, parentId: true },
    }),
    prisma.expense.findMany({
      where: { projectId: { in: writableIds } },
      select: { title: true, projectId: true },
      distinct: ["projectId", "title"],
      orderBy: { title: "asc" },
    }),
  ]);
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

  const titlesByProject: Record<string, string[]> = {};
  for (const t of titleRows) {
    if (!t.title) continue;
    (titlesByProject[t.projectId] ??= []).push(t.title);
  }

  const rows = financeProjects.map((a) => {
    const f = finance.get(a.project.id)!;
    return { project: a.project, ...f, saldo: f.income - f.spent, expected: f.income - f.spent - f.forecast };
  });
  const sum = (k: "income" | "spent" | "forecast" | "saldo" | "expected") => rows.reduce((x, r) => x + r[k], 0);
  const money = (v: number, tone?: "saldo") => (
    <span className={tone === "saldo" ? (v < 0 ? "text-red-600" : v > 0 ? "text-emerald-700" : "text-stone-400") : v ? "text-stone-950" : "text-stone-300"}>
      {formatCurrency(v)}
    </span>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <QuickAdd
        projects={writableProjects}
        subsByProject={subsByProject}
        titlesByProject={titlesByProject}
        vendors={quickVendors}
        myVendorId={myVendorId}
        categories={categories}
        docTypes={docTypes}
        expenseStatuses={expenseStatuses}
        taskStatuses={taskStatuses}
      />

      {/* Období pro souhrn. Prostý GET formulář – DateInput posílá ISO
          skrytým polem, takže tu není potřeba žádný klientský stav. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1 text-xs text-stone-500">
          od
          <DateInput name="from" defaultValue={fromStr} className="h-8 px-2 text-xs" />
        </label>
        <label className="flex items-center gap-1 text-xs text-stone-500">
          do
          <DateInput name="to" defaultValue={toStr} className="h-8 px-2 text-xs" />
        </label>
        <button
          type="submit"
          className="h-8 cursor-pointer border border-stone-300 px-3 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
        >
          Filtrovat
        </button>
        {periodActive && (
          <Link href="/dashboard" className="h-8 px-2 text-xs leading-8 text-stone-400 hover:text-stone-950">
            Zrušit období
          </Link>
        )}
      </form>

      {/* Finance po projektech – příjmy, výdaje, forecast (co ještě zaplatíme)
          a saldo. Dřív tu byly jen součty za všechno dohromady. */}
      {rows.length > 0 && (
        <section className="mb-12 border border-stone-200 bg-white shadow-soft">
          <div className="-mx-px overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left">
                  <th className="kicker px-4 py-3 font-normal">{periodActive ? "Projekt · za období" : "Projekt"}</th>
                  <th className="kicker px-4 py-3 text-right font-normal">Příjmy</th>
                  <th className="kicker px-4 py-3 text-right font-normal">Výdaje</th>
                  <th className="kicker px-4 py-3 text-right font-normal" title="Co ještě zaplatíme: žádanky (cena nebo nabídka) a odhady v plánu, minus už zaplacené">
                    Forecast
                  </th>
                  <th className="kicker px-4 py-3 text-right font-normal">Saldo</th>
                  <th className="kicker px-4 py-3 text-right font-normal">Oček. saldo</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {rows.map((r) => (
                  <tr key={r.project.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="px-4 py-3 font-sans">
                      <Link href={`/projects/${r.project.id}`} className="flex items-center gap-2.5 text-stone-950 underline-offset-4 hover:underline">
                        <ProjectIcon type={r.project.type} className="size-4 shrink-0 text-stone-600" />
                        {r.project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">{money(r.income)}</td>
                    <td className="px-4 py-3 text-right">{money(r.spent)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{r.forecast ? formatCurrency(r.forecast) : money(0)}</td>
                    <td className="px-4 py-3 text-right">{money(r.saldo, "saldo")}</td>
                    <td className="px-4 py-3 text-right">{money(r.expected, "saldo")}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot className="font-mono tabular-nums">
                  <tr className="border-t border-stone-300 font-medium">
                    <td className="kicker px-4 py-3 font-sans">Celkem</td>
                    <td className="px-4 py-3 text-right">{money(sum("income"))}</td>
                    <td className="px-4 py-3 text-right">{money(sum("spent"))}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(sum("forecast"))}</td>
                    <td className="px-4 py-3 text-right">{money(sum("saldo"), "saldo")}</td>
                    <td className="px-4 py-3 text-right">{money(sum("expected"), "saldo")}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-12 lg:grid-cols-2">
        {/* Projekty */}
        <section className="min-w-0">
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
                        {accessible.find((x) => x.project.id === p.id)?.role === "task" ? "moje úkoly" : `${p._count.expenses} výdajů · ${p._count.documents} dok.`}
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
        <section className="min-w-0">
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
