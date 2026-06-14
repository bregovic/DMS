import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { GanttChart, type GanttItem } from "@/components/planning/gantt-chart";
import { TASK_DONE_STATUSES, taskStatusLabel } from "@/lib/constants";

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
              parentId: true,
              kind: true,
              subProject: { select: { name: true } },
            },
          },
          requests: {
            where: { requiredDate: { not: null } },
            orderBy: { requiredDate: "asc" },
            select: {
              id: true,
              title: true,
              requiredDate: true,
              status: true,
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
      const sc = scope;
      const visible = (
        subProjectId: string | null,
        createdById: string,
        assignee?: string | null,
      ) =>
        (!sc ||
          (!!subProjectId && sc.has(subProjectId)) ||
          createdById === user.id ||
          assignee === email) &&
        (!mine || createdById === user.id || assignee === email);

      const tasks = p.tasks.filter((t) =>
        visible(t.subProjectId, t.createdById, t.assigneeEmail),
      );

      // Dílčí úkoly pod fázemi (zobrazí se po kliknutí, ne samostatně)
      const childrenByPhase = new Map<string, typeof tasks>();
      for (const t of tasks)
        if (t.parentId) {
          const a = childrenByPhase.get(t.parentId) ?? [];
          a.push(t);
          childrenByPhase.set(t.parentId, a);
        }
      const done = (st: string) => TASK_DONE_STATUSES.includes(st);

      const topRows = tasks.filter((t) =>
        t.kind === "phase"
          ? !!(t.startDate || t.dueDate)
          : !t.parentId && !!(t.startDate || t.dueDate),
      );

      const items: GanttItem[] = topRows
        .map((t): GanttItem => {
          const baseName = t.subProject ? `${t.subProject.name}: ${t.title}` : t.title;
          if (t.kind === "phase") {
            const kids = childrenByPhase.get(t.id) ?? [];
            const allDone = kids.length > 0 && kids.every((k) => done(k.status));
            return {
              id: t.id,
              name: baseName,
              start: t.startDate,
              end: t.dueDate,
              done: done(t.status),
              kind: "phase",
              prereqMet: kids.length === 0 ? true : allDone,
              children: kids.map((k) => ({
                id: k.id,
                title: k.title,
                start: k.startDate,
                end: k.dueDate,
                done: done(k.status),
                statusLabel: taskStatusLabel(k.status),
                assigneeEmail: k.assigneeEmail,
              })),
            };
          }
          return {
            id: t.id,
            name: baseName,
            start: t.startDate,
            end: t.dueDate,
            done: done(t.status),
            kind: "task",
          };
        })
        .sort((a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime());

      // Žádanky (výběrová řízení) jako milníky; červené, dokud nejsou dokončené
      const reqItems: GanttItem[] = p.requests
        .filter((r) => visible(r.subProjectId, r.createdById))
        .map((r): GanttItem => ({
          id: `req-${r.id}`,
          name: `Žádanka: ${r.subProject ? `${r.subProject.name}: ` : ""}${r.title}`,
          start: null,
          end: r.requiredDate,
          done: r.status === "schvaleno" || r.status === "zruseno",
          kind: "request",
        }));

      const allItems = [...items, ...reqItems].sort(
        (a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime(),
      );
      return { project: p, items: allItems };
    })
    .filter((x) => x.items.length > 0);

  const tabClass = (active: boolean) =>
    `border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-stone-950 bg-stone-950 text-white"
        : "border-stone-300 text-stone-600 hover:border-stone-950"
    }`;

  return (
    <div className="w-full">
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
