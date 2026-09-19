import { prisma } from "@/lib/prisma";
import { TASK_DONE_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ActivityPeriod = "dnes" | "vcera" | "tyden" | "mesic";
export const ACTIVITY_PERIODS: { key: ActivityPeriod; label: string }[] = [
  { key: "dnes", label: "Dnes" },
  { key: "vcera", label: "Včera" },
  { key: "tyden", label: "Tento týden" },
  { key: "mesic", label: "Tento měsíc" },
];

/** Hranice období jako UTC půlnoci pražských dní (data výkazů a dokončení jsou dny). */
function range(period: ActivityPeriod): [Date, Date] {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" }); // YYYY-MM-DD
  const d0 = new Date(`${today}T00:00:00Z`);
  const day = 86400000;
  if (period === "vcera") return [new Date(d0.getTime() - day), d0];
  if (period === "tyden") {
    const dow = (d0.getUTCDay() + 6) % 7; // po = 0
    return [new Date(d0.getTime() - dow * day), new Date(d0.getTime() + day)];
  }
  if (period === "mesic") return [new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)), new Date(d0.getTime() + day)];
  return [d0, new Date(d0.getTime() + day)];
}

/**
 * Aktivita v úkolech projektu: kdo co v období udělal – splněné úkoly
 * (skutečné dokončení) a vykázaná práce po úkolech (hodiny, částka, poznámky).
 * Osoba = e-mail (výkazy, které vytvořila; úkoly, kde je řešitel/dodavatel),
 * „mine“ = přihlášený uživatel, prázdné = všichni.
 */
export async function TaskActivity({
  projectId,
  period,
  person,
  personName,
  myUserId,
  myEmail,
  statusLabel,
}: {
  projectId: string;
  period: ActivityPeriod;
  person: string | null; // e-mail (malými), "mine", nebo null
  personName: string | null;
  myUserId: string;
  myEmail: string | null;
  statusLabel: (key: string) => string;
}) {
  const [from, to] = range(period);
  const email = person === "mine" ? myEmail : person;

  const [logs, done] = await Promise.all([
    prisma.expense.findMany({
      where: {
        projectId,
        taskId: { not: null },
        date: { gte: from, lt: to },
        ...(person === "mine"
          ? { createdById: myUserId }
          : email
            ? { createdBy: { email: { equals: email, mode: "insensitive" } } }
            : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        hours: true,
        amount: true,
        currency: true,
        description: true,
        createdBy: { select: { name: true, email: true } },
        task: { select: { id: true, title: true, status: true, percentDone: true, subProject: { select: { name: true } } } },
      },
    }),
    prisma.task.findMany({
      where: {
        projectId,
        actualEnd: { gte: from, lt: to },
        status: { in: TASK_DONE_STATUSES },
        kind: { not: "phase" },
        ...(email
          ? {
              OR: [
                { assigneeEmail: { equals: email, mode: "insensitive" } },
                { vendor: { email: { equals: email, mode: "insensitive" } } },
                ...(person === "mine" ? [{ createdById: myUserId, assigneeEmail: null, vendorId: null }] : []),
              ],
            }
          : {}),
      },
      orderBy: { actualEnd: "desc" },
      select: {
        id: true,
        title: true,
        actualEnd: true,
        assigneeEmail: true,
        vendor: { select: { name: true } },
        subProject: { select: { name: true } },
      },
    }),
  ]);

  // výkazy seskupené po úkolech
  const byTask = new Map<string, { task: NonNullable<(typeof logs)[number]["task"]>; hours: number; amount: number; rows: typeof logs }>();
  for (const l of logs) {
    if (!l.task) continue;
    const g = byTask.get(l.task.id) ?? { task: l.task, hours: 0, amount: 0, rows: [] };
    g.hours += Number(l.hours ?? 0);
    g.amount += Number(l.amount);
    g.rows.push(l);
    byTask.set(l.task.id, g);
  }
  const hours = logs.reduce((a, l) => a + Number(l.hours ?? 0), 0);
  const amount = logs.reduce((a, l) => a + Number(l.amount), 0);
  const periodLabel = ACTIVITY_PERIODS.find((p) => p.key === period)?.label.toLowerCase() ?? "";
  const who = personName ?? "Všichni";
  const multiPeople = !email && new Set(logs.map((l) => l.createdBy.email)).size > 1;

  return (
    <section className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-px border border-stone-200 bg-stone-200 sm:grid-cols-4">
        {[
          { l: "Splněné úkoly", v: String(done.length) },
          { l: "Úkoly s prací", v: String(byTask.size) },
          { l: "Odpracováno", v: `${hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} h` },
          { l: "Vykázáno", v: formatCurrency(amount) },
        ].map((x) => (
          <div key={x.l} className="bg-white px-4 py-3">
            <p className="kicker">{x.l}</p>
            <p className="mt-1 font-mono text-lg text-stone-950">{x.v}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="kicker mb-2">
          Splněno · {who} · {periodLabel}
        </h3>
        {done.length === 0 ? (
          <p className="text-sm text-stone-500">Žádný úkol nebyl v tomto období dokončen.</p>
        ) : (
          <ul className="border-t border-stone-200">
            {done.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-stone-200 py-2.5 text-sm">
                <span className="text-emerald-700">✓</span>
                <span className="min-w-0 flex-1 text-stone-950">
                  {t.title}
                  {t.subProject && <span className="text-xs text-stone-400"> · {t.subProject.name}</span>}
                </span>
                {!email && (t.vendor?.name || t.assigneeEmail) && (
                  <span className="text-xs text-stone-500">{t.vendor?.name ?? t.assigneeEmail}</span>
                )}
                <span className="text-xs text-stone-500">{t.actualEnd ? formatDate(t.actualEnd) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="kicker mb-2">
          Vykázaná práce · {who} · {periodLabel}
        </h3>
        {byTask.size === 0 ? (
          <p className="text-sm text-stone-500">V tomto období nikdo nic nevykázal.</p>
        ) : (
          <ul className="border-t border-stone-200">
            {[...byTask.values()].map((g) => {
              const finished = TASK_DONE_STATUSES.includes(g.task.status);
              return (
                <li key={g.task.id} className="border-b border-stone-200 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 text-sm font-medium text-stone-950">
                      {g.task.title}
                      {g.task.subProject && <span className="text-xs font-normal text-stone-400"> · {g.task.subProject.name}</span>}
                    </span>
                    <span className={`text-xs ${finished ? "text-emerald-700" : "text-stone-500"}`}>
                      {statusLabel(g.task.status)}
                      {!finished && g.task.percentDone ? ` · ${g.task.percentDone} %` : ""}
                    </span>
                    <span className="w-16 text-right text-xs text-stone-600">
                      {g.hours ? `${g.hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} h` : ""}
                    </span>
                    <span className="w-24 text-right font-mono text-sm text-stone-950">{formatCurrency(g.amount)}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 pl-3 text-xs text-stone-500">
                    {g.rows.map((r) => (
                      <li key={r.id}>
                        {formatDate(r.date)}
                        {multiPeople ? ` · ${r.createdBy.name ?? r.createdBy.email}` : ""}
                        {r.hours ? ` · ${Number(r.hours).toLocaleString("cs-CZ")} h` : ""}
                        {r.description ? ` · ${r.description}` : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
