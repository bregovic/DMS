import Link from "next/link";
import { DateInput } from "@/components/ui/date-input";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { GanttChart } from "@/components/planning/gantt-chart";
import { buildProjectGantt } from "@/server/planning";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{
    mine?: string; f?: string; vr?: string; from?: string; to?: string;
  }>;
}) {
  const user = await requireUser();
  const email = user.email?.toLowerCase() ?? "";
  const sp = await searchParams;
  const mine = sp?.mine === "1";
  const statusF = (["open", "done", "overdue"] as const).find((x) => x === sp?.f) ?? "all";
  const onlyVR = sp?.vr === "1";
  const fromD = sp?.from ? new Date(sp.from) : null;
  const toD = sp?.to ? new Date(sp.to) : null;
  if (toD) toD.setHours(23, 59, 59, 999);
  const anyFilter = mine || onlyVR || statusF !== "all" || !!sp?.from || !!sp?.to;

  // Přístupné projekty: vlastní + projektové členství + složkové členství.
  const [owned, projMems, subMems] = await Promise.all([
    prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } }),
    email
      ? prisma.projectMembership.findMany({ where: { email }, select: { projectId: true } })
      : Promise.resolve([]),
    email
      ? prisma.subProjectMembership.findMany({
          where: { email },
          select: { projectId: true, subProjectId: true },
        })
      : Promise.resolve([]),
  ]);

  const fullIds = new Set<string>([
    ...owned.map((p) => p.id),
    ...projMems.map((m) => m.projectId),
  ]);
  // projekty přístupné jen přes složku → omezený rozsah
  const subScope = new Map<string, Set<string>>();
  for (const m of subMems) {
    if (fullIds.has(m.projectId)) continue;
    const s = subScope.get(m.projectId) ?? new Set<string>();
    s.add(m.subProjectId);
    subScope.set(m.projectId, s);
  }
  const allIds = [...new Set([...fullIds, ...subScope.keys()])];

  const projects = allIds.length
    ? await prisma.project.findMany({
        where: { id: { in: allIds } },
        orderBy: { name: "asc" },
        include: {
          subProjects: { select: { id: true, parentId: true } },
          tasks: {
            orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              title: true,
              startDate: true,
              dueDate: true,
              status: true,
              createdById: true,
              assigneeEmail: true,
              subProjectId: true,
              parentId: true,
              kind: true,
              percentDone: true,
              subProject: { select: { name: true } },
              dependsOn: {
                select: {
                  dependsOn: { select: { id: true, title: true, status: true } },
                },
              },
              requests: { select: { status: true, leadDays: true, requiredDate: true } },
            },
          },
          requests: {
            where: { OR: [{ requiredDate: { not: null } }, { startDate: { not: null } }] },
            orderBy: { requiredDate: "asc" },
            select: {
              id: true,
              title: true,
              startDate: true,
              requiredDate: true,
              status: true,
              taskId: true,
              createdById: true,
              subProjectId: true,
              subProject: { select: { name: true } },
            },
          },
        },
      })
    : [];

  const today = new Date();

  const planned = projects
    .map((p) => {
      // Rozsah (null = plný přístup): povolené složky + jejich pod-složky
      let scope: Set<string> | null = null;
      if (!fullIds.has(p.id)) {
        const childrenOf = new Map<string, string[]>();
        for (const s of p.subProjects)
          if (s.parentId) {
            const a = childrenOf.get(s.parentId) ?? [];
            a.push(s.id);
            childrenOf.set(s.parentId, a);
          }
        scope = new Set<string>();
        const stack = [...(subScope.get(p.id) ?? [])];
        while (stack.length) {
          const x = stack.pop()!;
          if (scope.has(x)) continue;
          scope.add(x);
          (childrenOf.get(x) ?? []).forEach((ch) => stack.push(ch));
        }
      }
      const allItems = buildProjectGantt(p.tasks, p.requests, {
        scope,
        userId: user.id,
        email,
        mine,
        filter: { status: statusF, onlyRequests: onlyVR, from: fromD, to: toD },
      });
      return { project: p, items: allItems };
    })
    .filter((x) => x.items.length > 0);

  const selectClass =
    "h-8 rounded-none border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950";

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">Plánování</h1>
          <p className="mt-2 max-w-xl text-sm text-stone-500">
            Časová osa úkolů podle začátku a termínu. Termíny i stavy se nastavují
            u úkolů v projektu (sekce Úkoly).
          </p>
        </div>
      </header>

      {/* Filtry */}
      <form method="get" className="mb-8 flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400">
          Stav
          <select name="f" defaultValue={statusF} className={selectClass}>
            <option value="all">Vše</option>
            <option value="open">Otevřené</option>
            <option value="done">Hotové</option>
            <option value="overdue">Po termínu</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400">
          Od
          <DateInput name="from" defaultValue={sp?.from ?? ""} className={selectClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400">
          Do
          <DateInput name="to" defaultValue={sp?.to ?? ""} className={selectClass} />
        </label>
        <label className="flex h-8 items-center gap-1.5 text-xs text-stone-600">
          <input type="checkbox" name="vr" value="1" defaultChecked={onlyVR} className="size-4 accent-stone-900" />
          Pouze VŘ
        </label>
        <label className="flex h-8 items-center gap-1.5 text-xs text-stone-600">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 accent-stone-900" />
          Jen moje
        </label>
        <button
          type="submit"
          className="h-8 border border-stone-950 bg-stone-950 px-3 text-xs text-white transition-colors hover:bg-stone-800"
        >
          Filtrovat
        </button>
        {anyFilter && (
          <Link
            href="/planning"
            className="h-8 border border-stone-300 px-3 text-xs leading-8 text-stone-600 transition-colors hover:border-stone-950"
          >
            Zrušit filtr
          </Link>
        )}
      </form>

      {planned.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          {anyFilter
            ? "Filtru nic neodpovídá. Zkus ho zmírnit nebo zrušit."
            : "Zatím tu není co plánovat. Přidej úkolům začátek nebo termín a objeví se tu jejich časová osa."}
        </p>
      ) : (
        <div className="space-y-12">
          {planned.map(({ project: p, items }) => (
            <section key={p.id}>
              <div className="mb-4 flex items-baseline justify-between border-b border-stone-300/80 pb-2">
                <h2 className="kicker">
                  {p.name} · {items.length}
                </h2>
                <Link
                  href={`/projects/${p.id}`}
                  className="inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                >
                  Otevřít projekt
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
              <GanttChart items={items} today={today} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
