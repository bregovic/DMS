import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { isManager, listProjectsForUser } from "@/server/access";
import { getStatuses } from "@/server/statuses";
import { BulkTaskBar } from "@/components/tasks/bulk-task-bar";
import { TaskRow } from "@/components/tasks/task-row";
import { INV_ATTR } from "@/lib/bulk-ids";
import { InvoiceCreateBar } from "@/components/invoices/invoice-create-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { parseStatusFilter } from "@/lib/list-filter";
import { TASK_DONE_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
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
export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
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
        invoice: { select: { id: true, number: true, status: true, kind: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { issuerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, number: true, kind: true, status: true, amount: true, currency: true, dueDate: true, project: { select: { name: true } } },
    }),
  ]);

  // Rozsah: mine = přidělené mně (výchozí), all = všechny úkoly v projektech, které spravuji
  const accessible = await listProjectsForUser(user);
  const managedIds = accessible.filter((a) => isManager(a.role)).map((a) => a.project.id);
  const scopeAll = sp?.mscope === "all" && managedIds.length > 0;
  const mineWhere = email
    ? [{ vendor: { email: { equals: email, mode: "insensitive" as const } } }, { assigneeEmail: email }]
    : [];

  const [tasks, statuses] = await Promise.all([
    email || scopeAll
      ? prisma.task.findMany({
          where: scopeAll
            ? { OR: [{ projectId: { in: managedIds }, kind: { not: "phase" } }, ...mineWhere] }
            : { OR: mineWhere },
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            kind: true,
            status: true,
            priority: true,
            profession: true,
            estimateDays: true,
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
            assigneeEmail: true,
            vendor: { select: { hourlyRate: true, email: true, name: true } },
            expenses: {
              // u vlastních úkolů moje výkazy, u cizích (rozsah Vše) všechny
              where: scopeAll ? {} : { createdById: user.id },
              select: { amount: true, hours: true },
            },
          },
        })
      : Promise.resolve([]),
    getStatuses("task"),
  ]);

  const statusLabel = new Map(statuses.map((s) => [s.key, s.label]));
  const statusColor = new Map(statuses.map((s) => [s.key, s.color]));
  const canOpen = new Set(accessible.map((a) => a.project.id));
  const isDone = (st: string) => TASK_DONE_STATUSES.includes(st);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Lidé (rozsah Vše): dodavatel/řešitel podle e-mailu, jméno z dodavatele nebo účtu
  const low = (e: string | null | undefined) => e?.toLowerCase() ?? null;
  const isMine = (t: (typeof tasks)[number]) => !!email && (low(t.assigneeEmail) === email || low(t.vendor?.email) === email);
  const peopleMap = new Map<string, string | null>();
  for (const t of tasks) {
    if (t.vendor?.email) peopleMap.set(t.vendor.email.toLowerCase(), t.vendor.name);
    if (t.assigneeEmail && !peopleMap.has(t.assigneeEmail.toLowerCase())) peopleMap.set(t.assigneeEmail.toLowerCase(), null);
  }
  const unnamed = [...peopleMap.entries()].filter(([, n]) => !n).map(([e]) => e);
  if (unnamed.length)
    for (const u of await prisma.user.findMany({ where: { email: { in: unnamed, mode: "insensitive" } }, select: { email: true, name: true } }))
      if (u.email && u.name) peopleMap.set(u.email.toLowerCase(), u.name);
  if (email) peopleMap.delete(email);
  const people = [...peopleMap.entries()].map(([e, n]) => ({ email: e, name: n || e })).sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const nameOf = (e: string | null | undefined) => (e ? (e.toLowerCase() === email ? "já" : peopleMap.get(e.toLowerCase()) || e) : null);
  const mper = scopeAll && typeof sp?.mper === "string" ? sp.mper : "";
  const personMatch = (t: (typeof tasks)[number]) =>
    !mper ||
    (mper === "mine"
      ? isMine(t)
      : mper === "none"
        ? !t.vendor && !t.assigneeEmail
        : mper.startsWith("p:")
          ? [low(t.assigneeEmail), low(t.vendor?.email)].includes(mper.slice(2))
          : true);
  const myHref = (over: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp ?? {})) if (typeof v === "string") u.set(k, v);
    for (const [k, v] of Object.entries(over)) if (v == null) u.delete(k); else u.set(k, v);
    const q = u.toString();
    return q ? `/ukoly?${q}` : "/ukoly";
  };
  const chip = (active: boolean) =>
    `border px-2 py-0.5 text-[11px] uppercase tracking-wide transition-colors ${
      active ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-500 hover:border-stone-950"
    }`;

  // Filtr (prefix m): hledání, stav (výchozí neukončené), projekt, termín, řazení.
  const mstRaw = sp?.mst;
  const mstSel = parseStatusFilter(mstRaw, []);
  const mq = (typeof sp?.mq === "string" ? sp.mq : "").trim().toLowerCase();
  const mproj = typeof sp?.mproj === "string" ? sp.mproj : "";
  const mfrom = typeof sp?.mfrom === "string" && sp.mfrom ? new Date(sp.mfrom) : null;
  const mto = typeof sp?.mto === "string" && sp.mto ? new Date(sp.mto) : null;
  if (mto) mto.setHours(23, 59, 59, 999);
  const msort = sp?.msort === "title" ? "title" : "due";
  const mdir = sp?.mdir === "desc" ? -1 : 1;
  const customStatus = typeof mstRaw === "string";
  const shown = tasks
    .filter(
      (t) =>
        (customStatus ? !mstSel || mstSel.has(t.status) : !isDone(t.status)) &&
        (!mq || t.title.toLowerCase().includes(mq) || t.project.name.toLowerCase().includes(mq)) &&
        (!mproj || t.project.id === mproj) &&
        personMatch(t) &&
        (!mfrom || (!!t.dueDate && t.dueDate >= mfrom)) &&
        (!mto || (!!t.dueDate && t.dueDate <= mto)),
    )
    .sort((a, b) =>
      msort === "title"
        ? a.title.localeCompare(b.title, "cs") * mdir
        : ((a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)) * mdir,
    );
  const filterActive = customStatus || !!mq || !!mproj || !!mfrom || !!mto || !!mper;
  const statusCounts: Record<string, number> = {};
  for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  const projectOptions = [...new Map(tasks.map((t) => [t.project.id, t.project.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "cs"))
    .map(([value, label]) => ({ value, label }));

  const open = tasks.filter((t) => !isDone(t.status) && personMatch(t));
  // bez vlastního výběru stavu se hotové ukazují zvlášť dole (sbalené)
  const done = customStatus ? [] : tasks.filter((t) => isDone(t.status) && personMatch(t) && (!mproj || t.project.id === mproj));

  // Seskupit podle projektu - dodavatel dělá často pro víc zakázek.
  const byProject = new Map<string, { name: string; id: string; rows: typeof open }>();
  for (const t of shown) {
    const g = byProject.get(t.project.id) ?? { name: t.project.name, id: t.project.id, rows: [] };
    g.rows.push(t);
    byProject.set(t.project.id, g);
  }

  const sums = { all: 0, open: 0, waiting: 0, paid: 0 };
  for (const e of myExpenses) {
    const a = Number(e.amount);
    sums.all += a;
    if (e.stage === "uhrazeno") sums.paid += a;
    else if (e.invoice && e.invoice.status !== "cancelled") sums.waiting += a;
    else sums.open += a;
  }

  const loggedTotal = tasks.reduce(
    (s, t) => s + t.expenses.reduce((a, e) => a + Number(e.amount), 0),
    0,
  );

  function Row({ t }: { t: (typeof tasks)[number] }) {
    const rate = t.vendor?.hourlyRate != null ? Number(t.vendor.hourlyRate) : null;
    const ctx = [t.subProject?.name, t.parent ? `Fáze: ${t.parent.title}` : null].filter(Boolean).join(" · ");
    return (
      <TaskRow
        todayStart={todayStart}
        statuses={statusList}
        canSelect
        canStatus
        canLog
        defaultRate={rate}
        t={{
          id: t.id,
          title: t.title,
          kind: t.kind,
          status: t.status,
          statusLabel: statusLabel.get(t.status) ?? taskStatusLabel(t.status),
          statusColor: statusColor.get(t.status) ?? "stone",
          done: isDone(t.status),
          priority: t.priority,
          profession: t.profession,
          ready: t.ready,
          dueDate: t.dueDate,
          estimateDays: t.estimateDays,
          percentDone: t.percentDone,
          description: t.description,
          context: ctx || undefined,
          ...(scopeAll ? { vendorName: t.vendor?.name ?? null, assigneeEmail: t.assigneeEmail ? nameOf(t.assigneeEmail) : null } : {}),
          logged: {
            amount: t.expenses.reduce((a, e) => a + Number(e.amount), 0),
            hours: t.expenses.reduce((a, e) => a + Number(e.hours ?? 0), 0),
          },
        }}
      />
    );
  }
  const statusList = statuses.map((s) => ({ key: s.key, label: s.label }));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">{scopeAll ? "Úkoly v mých projektech" : "Moje úkoly"}</h1>
          <p className="kicker mt-1">
            {open.length} otevřených{done.length ? ` · ${done.length} hotových` : ""}
          </p>
        </div>
        {!scopeAll && loggedTotal > 0 && (
          <div className="text-right">
            <p className="kicker">Vykázáno celkem</p>
            <p className="display mt-1 text-2xl text-stone-950">{formatCurrency(loggedTotal)}</p>
          </div>
        )}
      </header>

      {(managedIds.length > 0 || tasks.length > 0) && (
        <div className="mb-4 space-y-2 border border-stone-200 bg-white p-3 shadow-soft">
          {managedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="kicker mr-1 w-14">Úkoly</span>
              <Link href={myHref({ mscope: null, mper: null })} className={chip(!scopeAll)}>
                Přidělené mně
              </Link>
              <Link href={myHref({ mscope: "all" })} className={chip(scopeAll)}>
                Všechny v mých projektech
              </Link>
            </div>
          )}
          {scopeAll && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="kicker mr-1 w-14">Kdo</span>
              <Link href={myHref({ mper: null })} className={chip(!mper)}>
                Všichni
              </Link>
              <Link href={myHref({ mper: "mine" })} className={chip(mper === "mine")}>
                Já
              </Link>
              {people.map((x) => (
                <Link key={x.email} href={myHref({ mper: `p:${x.email}` })} className={chip(mper === `p:${x.email}`)}>
                  {x.name}
                </Link>
              ))}
              <Link href={myHref({ mper: "none" })} className={chip(mper === "none")}>
                Nepřidělené
              </Link>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="kicker mr-1 w-14">Stav</span>
            <Link href={myHref({ mst: null })} className={chip(!customStatus)}>
              Otevřené
            </Link>
            <Link href={myHref({ mst: "done" })} className={chip(mstRaw === "done")}>
              Hotové
            </Link>
            <Link href={myHref({ mst: "all" })} className={chip(mstRaw === "all")}>
              Vše
            </Link>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title="Žádné přidělené úkoly"
          description="Až ti někdo přidělí úkol (jako dodavateli nebo řešiteli), objeví se tady a půjde na něj vykázat práci."
        />
      ) : (
        <>
          <ListFilters
            prefix="m"
            placeholder="Hledat úkol nebo projekt…"
            sortOptions={[
              { value: "due", label: "Termín" },
              { value: "title", label: "Název" },
            ]}
            selects={
              projectOptions.length > 1 ? [{ key: "proj", label: "Projekt – vše", options: projectOptions }] : []
            }
            statuses={statuses.map((st) => ({ key: st.key, label: st.label, color: st.color ?? null, count: statusCounts[st.key] ?? 0 }))}
            defaultStatuses={statuses.map((st) => st.key).filter((k) => !isDone(k))}
          />
          {shown.length === 0 && (
            <p className="py-6 text-sm text-stone-500">
              {filterActive ? "Filtru nic neodpovídá." : "Všechno hotovo – hotové úkoly najdeš níže nebo ve Filtru, stav Vše."}
            </p>
          )}
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

          <BulkTaskBar
            statuses={statusList}
            logTasks={open.map((t) => ({
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
          {(myExpenses.length > 0 || myInvoices.length > 0) && (
            <section className="mb-8 mt-12 border-t border-stone-300/80 pt-8">
              <h2 className="display text-2xl text-stone-950">Moje vykázaná práce a vyúčtování</h2>
              <p className="mb-5 mt-1 text-xs text-stone-500">
                Jen to, co jsi sám vykázal na úkoly (hodiny, částky). Když pracuješ pro někoho jiného, zaškrtni nevyúčtované
                výkazy a vystav fakturu nebo žádost o úhradu – vlastník projektu dostane oznámení a zaplatí přes QR. Výdaje
                a výkazy ostatních ve tvých projektech najdeš v{" "}
                <Link href="/payments" className="underline underline-offset-2 hover:text-stone-950">
                  Platbách
                </Link>
                . Fakturační údaje doplníš v{" "}
                <Link href="/settings" className="underline underline-offset-2 hover:text-stone-950">
                  Nastavení
                </Link>
                .
              </p>

              <div className="mb-6 grid grid-cols-2 gap-px border border-stone-200 bg-stone-200 sm:grid-cols-4">
                {[
                  { l: "Vykázáno", v: sums.all, c: "text-stone-950" },
                  { l: "K vyúčtování", v: sums.open, c: "text-stone-950" },
                  { l: "Čeká na úhradu", v: sums.waiting, c: "text-orange-700" },
                  { l: "Uhrazeno", v: sums.paid, c: "text-emerald-700" },
                ].map((x) => (
                  <div key={x.l} className="bg-white px-4 py-3">
                    <p className="kicker">{x.l}</p>
                    <p className={`mt-1 font-mono text-lg ${x.c}`}>{formatCurrency(x.v)}</p>
                  </div>
                ))}
              </div>

              {myInvoices.length > 0 && (
                <div className="mb-8">
                  <h3 className="kicker mb-2">Faktury a žádosti o úhradu</h3>
                  <ul className="text-sm">
                    {myInvoices.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-200 py-2.5">
                        <Link href={`/faktury/${i.id}`} className="font-medium text-stone-950 underline-offset-2 hover:underline">
                          {i.kind === "request" ? "Žádost" : "Faktura"} {i.number}
                        </Link>
                        <span className="min-w-0 flex-1 truncate text-xs text-stone-500">{i.project.name}</span>
                        <span className="font-mono">{formatCurrency(Number(i.amount), i.currency)}</span>
                        <span
                          className={`w-28 text-right text-xs ${
                            i.status === "paid" ? "text-emerald-700" : i.status === "cancelled" ? "text-stone-400" : "text-orange-700"
                          }`}
                        >
                          {i.status === "paid" ? "uhrazeno" : i.status === "cancelled" ? "stornováno" : `splatné ${formatDate(i.dueDate)}`}
                        </span>
                        <span className="flex w-full justify-end gap-3 text-xs sm:w-auto">
                          <Link href={`/faktury/${i.id}`} className="text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline">
                            {i.status === "requested" ? "Zobrazit · QR" : "Zobrazit"}
                          </Link>
                          <Link href={`/faktury/${i.id}?pdf=1`} className="text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline">
                            PDF
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {myExpenses.length > 0 && (
                <>
                  <h3 className="kicker mb-2">Moje výkazy</h3>
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
                              className="size-4 shrink-0 cursor-pointer accent-stone-900"
                            />
                          ) : (
                            <span className="size-4 shrink-0" />
                          )}
                          <span className="w-20 shrink-0 text-xs text-stone-500">{formatDate(e.date)}</span>
                          <span className="min-w-0 flex-1 basis-40 truncate text-stone-900" title={e.title}>
                            {e.title}
                            <span className="text-xs text-stone-400"> · {e.project.name}</span>
                          </span>
                          {e.hours != null && Number(e.hours) > 0 && (
                            <span className="text-xs text-stone-500">{Number(e.hours).toLocaleString("cs-CZ")} h</span>
                          )}
                          <span className="font-mono text-stone-950">{formatCurrency(Number(e.amount), e.currency)}</span>
                          <span className="w-32 text-right text-xs">
                            {paid ? (
                              <span className="text-emerald-700">uhrazeno</span>
                            ) : invoiced ? (
                              <Link href={`/faktury/${e.invoice!.id}`} className="text-orange-700 underline-offset-2 hover:underline">
                                {e.invoice!.kind === "request" ? "žádost" : "faktura"} {e.invoice!.number}
                              </Link>
                            ) : (
                              <span className="text-stone-400">k vyúčtování</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <InvoiceCreateBar amounts={Object.fromEntries(myExpenses.map((e) => [e.id, Number(e.amount)]))} />
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
