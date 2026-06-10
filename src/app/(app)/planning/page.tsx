import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { GanttChart, type GanttItem } from "@/components/planning/gantt-chart";
import { TASK_DONE_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const user = await requireUser();
  const email = user.email?.toLowerCase() ?? "";
  const mine = (await searchParams)?.mine === "1";

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
              subProject: { select: { name: true } },
            },
          },
        },
      })
    : [];

  const today = new Date();

  const planned = projects
    .map((p) => {
      let tasks = p.tasks;

      // Složkový přístup: jen úkoly z povolených složek (+ pod-složek) nebo mé.
      if (!fullIds.has(p.id)) {
        const childrenOf = new Map<string, string[]>();
        for (const s of p.subProjects)
          if (s.parentId) {
            const a = childrenOf.get(s.parentId) ?? [];
            a.push(s.id);
            childrenOf.set(s.parentId, a);
          }
        const scope = new Set<string>();
        const stack = [...(subScope.get(p.id) ?? [])];
        while (stack.length) {
          const x = stack.pop()!;
          if (scope.has(x)) continue;
          scope.add(x);
          (childrenOf.get(x) ?? []).forEach((ch) => stack.push(ch));
        }
        tasks = tasks.filter(
          (t) =>
            (!!t.subProjectId && scope.has(t.subProjectId)) ||
            t.createdById === user.id ||
            t.assigneeEmail === email,
        );
      }

      // Filtr „jen moje"
      if (mine) {
        tasks = tasks.filter(
          (t) => t.createdById === user.id || t.assigneeEmail === email,
        );
      }

      const items: GanttItem[] = tasks
        .filter((t) => t.startDate || t.dueDate)
        .map((t) => ({
          id: t.id,
          name: t.subProject ? `${t.subProject.name}: ${t.title}` : t.title,
          start: t.startDate,
          end: t.dueDate,
          level: 0,
          dependsOnName: null,
          done: TASK_DONE_STATUSES.includes(t.status),
        }))
        .sort((a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime());
      return { project: p, items };
    })
    .filter((x) => x.items.length > 0);

  const tabClass = (active: boolean) =>
    `border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-stone-950 bg-stone-950 text-white"
        : "border-stone-300 text-stone-600 hover:border-stone-950"
    }`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">Plánování</h1>
          <p className="mt-2 max-w-xl text-sm text-stone-500">
            Časová osa úkolů podle začátku a termínu. Termíny i stavy se nastavují
            u úkolů v projektu (sekce Úkoly).
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/planning" className={tabClass(!mine)}>
            Všechny úkoly
          </Link>
          <Link href="/planning?mine=1" className={tabClass(mine)}>
            Jen moje
          </Link>
        </div>
      </header>

      {planned.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          {mine
            ? "Žádné tvoje úkoly s termínem."
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
