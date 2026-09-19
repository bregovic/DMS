import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { listProjectsForUser } from "@/server/access";
import { getStatuses } from "@/server/statuses";
import { BulkLogBar } from "@/components/tasks/bulk-log-bar";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { TaskProgressInput } from "@/components/tasks/task-progress-input";
import { INV_ATTR, PICK_ATTR } from "@/lib/bulk-ids";
import { InvoiceCreateBar } from "@/components/invoices/invoice-create-bar";
import { LogTaskExpense } from "@/components/tasks/log-task-expense";
import { EmptyState } from "@/components/ui/empty-state";
import { TASK_DONE_STATUSES, priorityColor, priorityLabel } from "@/lib/constants";
import { colorClasses } from "@/lib/status-colors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { GanttChart, type GanttItem } from "@/components/planning/gantt-chart";
import { taskStatusLabel } from "@/lib/constants";

/**
 * Moje úkoly (#29) – úkoly přidělené mně napříč projekty.
 *
 * Hlavně pro dodavatele: vlastník mu přidělí úkol (dodavatel s jeho
 * e-mailem), a on ho tu vidí a vykazuje na něj práci, aniž by musel mít
 * přístup k celému projektu. Kdo přístup do projektu má, dostane u
 * projektu odkaz; kdo ne, vidí jen tenhle seznam.
 *
 * Patří sem i úkoly s řešitelem = můj e-mail, takže to funguje i pro
 * členy rodiny, kterým je úkol přidělený jménem.
 */
export default async function MyTasksPage() {
  const user = await requireUser();
  const email = user.email?.toLowerCase() ?? "";

  // Moje výkazy (k fakturaci) a moje faktury.
  const [myExpenses, myInvoices] = await Promise.all([
    prisma.expense.findMany({
      where: { createdById: user.id, amount: { gt: 0 }, taskId: { not: null } },
      orderBy: { date: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        date: true,
        amount: true,
        currency: true,
        hours: true,
        stage: true,
        invoice: { select: { id: true, number: true, status: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { issuerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, number: true, status: true, amount: true, currency: true, dueDate: true, project: { select: { name: true } } },
    }),
  ]);

  const [tasks, statuses, accessible] = await Promise.all([
    email
      ? prisma.task.findMany({
          where: {
            OR: [
              { vendor: { email: { equals: email, mode: "insensitive" } } },
              { assigneeEmail: email },
            ],
          },
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            kind: true,
            status: true,
            priority: true,
            ready: true,
            dueDate: true,
            startDate: true,
            percentDone: true,
            parent: {
              select: { id: true, title: true, startDate: true, dueDate: true, status: true, percentDone: true },
            },
            description: true,
            project: { select: { id: true, name: true } },
            subProject: { select: { name: true } },
            vendor: { select: { hourlyRate: true, email: true } },
            expenses: {
              where: { createdById: user.id },
              select: { amount: true, hours: true },
            },
          },
        })
      : Promise.resolve([]),
    getStatuses("task"),
    listProjectsForUser(user),
  ]);

  const statusLabel = new Map(statuses.map((s) => [s.key, s.label]));
  const statusColor = new Map(statuses.map((s) => [s.key, s.color]));
  const canOpen = new Set(accessible.map((a) => a.project.id));
  const isDone = (st: string) => TASK_DONE_STATUSES.includes(st);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const open = tasks.filter((t) => !isDone(t.status));
  const done = tasks.filter((t) => isDone(t.status));

  // Seskupit podle projektu - dodavatel dělá často pro víc zakázek.
  const byProject = new Map<string, { name: string; id: string; rows: typeof open }>();
  for (const t of open) {
    const g = byProject.get(t.project.id) ?? { name: t.project.name, id: t.project.id, rows: [] };
    g.rows.push(t);
    byProject.set(t.project.id, g);
  }

  /**
   * Harmonogram pro dodavatele: fáze, ve kterých má úkoly, a uvnitř jen
   * jeho úkoly. Do projektu přístup mít nemusí – graf je jen k nahlédnutí.
   */
  const ganttByProject = new Map<string, { name: string; items: GanttItem[] }>();
  {
    const phases = new Map<string, { projectId: string; item: GanttItem }>();
    for (const t of tasks) {
      if (t.kind === "todo" || !(t.startDate || t.dueDate)) continue;
      const child = {
        id: t.id,
        title: t.title,
        start: t.startDate,
        end: t.dueDate,
        done: isDone(t.status),
        percentDone: t.percentDone,
        statusLabel: statusLabel.get(t.status) ?? taskStatusLabel(t.status),
        assigneeEmail: null,
      };
      const g = ganttByProject.get(t.project.id) ?? { name: t.project.name, items: [] };
      ganttByProject.set(t.project.id, g);
      if (t.parent) {
        let ph = phases.get(t.parent.id);
        if (!ph) {
          ph = {
            projectId: t.project.id,
            item: {
              id: t.parent.id,
              name: t.parent.title,
              start: t.parent.startDate,
              end: t.parent.dueDate,
              done: isDone(t.parent.status),
              percentDone: t.parent.percentDone,
              kind: "phase",
              children: [],
            },
          };
          phases.set(t.parent.id, ph);
          g.items.push(ph.item);
        }
        ph.item.children!.push(child);
      } else {
        g.items.push({ ...child, name: t.title, kind: "task" });
      }
    }
    for (const g of ganttByProject.values()) {
      for (const it of g.items)
        if (it.kind === "phase" && !it.start && !it.end) {
          // fáze bez vlastního termínu → rozsah z mých úkolů
          const ks = it.children!.map((c) => c.start ?? c.end).filter(Boolean) as Date[];
          const ke = it.children!.map((c) => c.end ?? c.start).filter(Boolean) as Date[];
          it.start = new Date(Math.min(...ks.map((d) => d.getTime())));
          it.end = new Date(Math.max(...ke.map((d) => d.getTime())));
        }
      g.items = g.items.filter((it) => it.start || it.end);
      g.items.sort((a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime());
    }
  }
  const gantts = [...ganttByProject.entries()].filter(([, g]) => g.items.length > 0);

  const loggedTotal = tasks.reduce(
    (s, t) => s + t.expenses.reduce((a, e) => a + Number(e.amount), 0),
    0,
  );

  function Row({ t }: { t: (typeof tasks)[number] }) {
    const finished = isDone(t.status);
    const overdue = !finished && !!t.dueDate && t.dueDate < todayStart;
    const logged = t.expenses.reduce((a, e) => a + Number(e.amount), 0);
    const hours = t.expenses.reduce((a, e) => a + Number(e.hours ?? 0), 0);
    const col = colorClasses(statusColor.get(t.status) ?? "stone");
    return (
      <li className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-stone-200 py-3.5">
        {!finished ? (
          <input
            type="checkbox"
            value={t.id}
            {...{ [PICK_ATTR]: "" }}
            aria-label={`Vybrat: ${t.title}`}
            title="Vybrat pro vykázání na víc úkolů najednou"
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-stone-900"
          />
        ) : (
          <span className="mt-0.5 size-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1 basis-52">
          <p className={`text-sm font-medium ${finished ? "text-stone-400 line-through" : "text-stone-950"}`}>
            {t.title}
          </p>
          <p className="kicker mt-0.5 flex flex-wrap items-center gap-x-2">
            {t.subProject && <span>{t.subProject.name}</span>}
            <span className={`border px-1.5 py-px text-[10px] ${col.chip}`}>
              {statusLabel.get(t.status) ?? t.status}
            </span>
            {t.priority && (
              <span className={`border px-1.5 py-px text-[10px] font-medium ${colorClasses(priorityColor(t.priority)).chip}`}>
                {priorityLabel(t.priority)}
              </span>
            )}
            {!finished && !t.ready && <span className="text-amber-700">čeká</span>}
            {t.dueDate && (
              <span className={overdue ? "text-red-600" : undefined}>do {formatDate(t.dueDate)}</span>
            )}
          </p>
          {t.description && <p className="mt-1 max-w-xl text-sm text-stone-500">{t.description}</p>}
          {logged > 0 && (
            <p className="mt-1 text-xs text-stone-500">
              Vykázáno <span className="font-mono text-stone-800">{formatCurrency(logged)}</span>
              {hours > 0 ? ` · ${hours.toLocaleString("cs-CZ")} h` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
          <TaskStatusSelect id={t.id} status={t.status} statuses={statuses.map((s) => ({ key: s.key, label: s.label }))} />
          {!finished && <TaskProgressInput taskId={t.id} percent={t.percentDone} />}
        </div>
        {!finished && (
          <div className="pl-8 sm:pl-0">
            <LogTaskExpense
              taskId={t.id}
              taskTitle={t.title}
              defaultRate={t.vendor?.hourlyRate != null ? Number(t.vendor.hourlyRate) : null}
              percentDone={t.percentDone}
              dueDate={t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null}
            />
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">Moje úkoly</h1>
          <p className="kicker mt-1">
            {open.length} otevřených{done.length ? ` · ${done.length} hotových` : ""}
          </p>
        </div>
        {loggedTotal > 0 && (
          <div className="text-right">
            <p className="kicker">Vykázáno celkem</p>
            <p className="display mt-1 text-2xl text-stone-950">{formatCurrency(loggedTotal)}</p>
          </div>
        )}
      </header>

      {tasks.length === 0 ? (
        <EmptyState
          title="Žádné přidělené úkoly"
          description="Až ti někdo přidělí úkol (jako dodavateli nebo řešiteli), objeví se tady a půjde na něj vykázat práci."
        />
      ) : (
        <>
          {[...byProject.values()].map((g) => (
            <section key={g.id} className="mb-8">
              <h2 className="kicker mb-1">
                {canOpen.has(g.id) ? (
                  <Link href={`/projects/${g.id}?tab=ukoly`} className="underline-offset-4 hover:underline">
                    {g.name}
                  </Link>
                ) : (
                  g.name
                )}
              </h2>
              <ul>
                {g.rows.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </ul>
            </section>
          ))}

          {gantts.length > 0 && (
            <section className="mb-8 mt-10">
              <h2 className="kicker mb-3">Harmonogram · fáze, kde mám úkoly</h2>
              {gantts.map(([pid, g]) => (
                <div key={pid} className="mb-6">
                  {gantts.length > 1 && <p className="mb-2 text-sm font-medium text-stone-900">{g.name}</p>}
                  <GanttChart items={g.items} today={todayStart} readOnly />
                </div>
              ))}
            </section>
          )}

          <BulkLogBar
            tasks={open.map((t) => ({
              id: t.id,
              title: t.title,
              percent: t.percentDone,
              due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
            }))}
            defaultRate={(() => {
              const v = open.find((t) => t.vendor?.hourlyRate != null)?.vendor?.hourlyRate;
              return v != null ? Number(v) : null;
            })()}
          />

          {myExpenses.length > 0 && (
            <section className="mb-8 mt-10">
              <h2 className="kicker mb-1">Moje výkazy</h2>
              <p className="mb-3 text-xs text-stone-500">
                Zaškrtni nezaplacené výkazy a vystav fakturu – vlastník projektu dostane žádost o úhradu s QR platbou.
                Fakturační údaje doplníš v Nastavení.
              </p>
              <ul>
                {myExpenses.map((e) => {
                  const paid = e.stage === "uhrazeno";
                  const invoiced = !!e.invoice && e.invoice.status !== "cancelled";
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-200 py-2.5 text-sm">
                      {!paid && !invoiced ? (
                        <input
                          type="checkbox"
                          value={e.id}
                          {...{ [INV_ATTR]: "" }}
                          aria-label={`Vybrat výkaz ${e.title}`}
                          className="size-5 shrink-0 cursor-pointer accent-stone-900"
                        />
                      ) : (
                        <span className="size-5 shrink-0" />
                      )}
                      <span className="w-20 shrink-0 text-xs text-stone-500">{formatDate(e.date)}</span>
                      <span className="min-w-0 flex-1 basis-40 truncate text-stone-900" title={e.title}>
                        {e.title}
                        <span className="text-xs text-stone-400"> · {e.project.name}</span>
                      </span>
                      <span className="font-mono text-stone-950">{formatCurrency(Number(e.amount), e.currency)}</span>
                      <span className="w-40 text-right text-xs">
                        {paid ? (
                          <span className="text-emerald-700">uhrazeno</span>
                        ) : invoiced ? (
                          <Link href={`/faktury/${e.invoice!.id}`} className="text-orange-700 underline-offset-2 hover:underline">
                            faktura {e.invoice!.number}
                          </Link>
                        ) : (
                          <span className="text-stone-400">k fakturaci</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <InvoiceCreateBar
                amounts={Object.fromEntries(myExpenses.map((e) => [e.id, Number(e.amount)]))}
              />
              {myInvoices.length > 0 && (
                <div className="mt-6">
                  <h3 className="kicker mb-2">Moje faktury</h3>
                  <ul className="text-sm">
                    {myInvoices.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-stone-100 py-2">
                        <Link href={`/faktury/${i.id}`} className="font-medium text-stone-950 underline-offset-2 hover:underline">
                          {i.number}
                        </Link>
                        <span className="text-xs text-stone-500">{i.project.name}</span>
                        <span className="ml-auto font-mono">{formatCurrency(Number(i.amount), i.currency)}</span>
                        <span
                          className={`w-24 text-right text-xs ${
                            i.status === "paid" ? "text-emerald-700" : i.status === "cancelled" ? "text-stone-400" : "text-orange-700"
                          }`}
                        >
                          {i.status === "paid" ? "uhrazena" : i.status === "cancelled" ? "stornována" : `splatná ${formatDate(i.dueDate)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {done.length > 0 && (
            <details className="mt-4">
              <summary className="kicker cursor-pointer select-none py-2">Hotové · {done.length}</summary>
              <ul>
                {done.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
