import { TASK_DONE_STATUSES, taskStatusLabel } from "@/lib/constants";
import type { GanttItem } from "@/components/planning/gantt-chart";

export type PlanTaskRow = {
  id: string;
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  status: string;
  createdById: string;
  assigneeEmail: string | null;
  subProjectId: string | null;
  parentId: string | null;
  kind: string;
  percentDone: number;
  subProject: { name: string } | null;
  dependsOn: { dependsOn: { id: string; title: string; status: string } }[];
};

export type PlanRequestRow = {
  id: string;
  title: string;
  requiredDate: Date | null;
  status: string;
  createdById: string;
  subProjectId: string | null;
  subProject: { name: string } | null;
};

/** Postaví položky Ganttu pro jeden projekt (fáze + samostatné úkoly + žádanky).
 *  scope = povolené složky (null = celý projekt). mine = jen moje úkoly. */
export function buildProjectGantt(
  tasks: PlanTaskRow[],
  requests: PlanRequestRow[],
  opts: {
    scope: Set<string> | null;
    userId: string;
    email: string;
    mine?: boolean;
    withSubprojectName?: boolean;
    /** true = striktně dle scope (nezahrne "moje" úkoly mimo scope). */
    strictScope?: boolean;
  },
): GanttItem[] {
  const {
    scope: sc,
    userId,
    email,
    mine = false,
    withSubprojectName = true,
    strictScope = false,
  } = opts;
  const visible = (
    subProjectId: string | null,
    createdById: string,
    assignee?: string | null,
  ) =>
    (!sc ||
      (!!subProjectId && sc.has(subProjectId)) ||
      (!strictScope && (createdById === userId || assignee === email))) &&
    (!mine || createdById === userId || assignee === email);

  const vtasks = tasks.filter((t) =>
    visible(t.subProjectId, t.createdById, t.assigneeEmail),
  );

  const childrenByPhase = new Map<string, PlanTaskRow[]>();
  for (const t of vtasks)
    if (t.parentId) {
      const a = childrenByPhase.get(t.parentId) ?? [];
      a.push(t);
      childrenByPhase.set(t.parentId, a);
    }
  const done = (st: string) => TASK_DONE_STATUSES.includes(st);

  const phaseDone = new Map<string, boolean>();
  for (const ph of vtasks.filter((t) => t.kind === "phase")) {
    const kids = childrenByPhase.get(ph.id) ?? [];
    phaseDone.set(
      ph.id,
      done(ph.status) || (kids.length > 0 && kids.every((k) => done(k.status))),
    );
  }

  const topRows = vtasks.filter((t) =>
    t.kind === "phase"
      ? !!(t.startDate || t.dueDate)
      : !t.parentId && !!(t.startDate || t.dueDate),
  );

  const name = (t: { subProject: { name: string } | null; title: string }) =>
    withSubprojectName && t.subProject ? `${t.subProject.name}: ${t.title}` : t.title;

  const items: GanttItem[] = topRows
    .map((t): GanttItem => {
      const effPct = (k: PlanTaskRow) => (done(k.status) ? 100 : k.percentDone ?? 0);
      if (t.kind === "phase") {
        const kids = childrenByPhase.get(t.id) ?? [];
        const allDone = kids.length > 0 && kids.every((k) => done(k.status));
        const blockers = (t.dependsOn ?? [])
          .map((d) => d.dependsOn)
          .filter((p) => !(phaseDone.get(p.id) ?? done(p.status)));
        const pct = kids.length
          ? Math.round(kids.reduce((s, k) => s + effPct(k), 0) / kids.length)
          : effPct(t);
        return {
          id: t.id,
          name: name(t),
          start: t.startDate,
          end: t.dueDate,
          done: done(t.status),
          kind: "phase",
          percentDone: pct,
          prereqMet: kids.length === 0 ? true : allDone,
          blocked: blockers.length > 0,
          blockedBy: blockers.map((p) => p.title),
          children: kids.map((k) => ({
            id: k.id,
            title: k.title,
            start: k.startDate,
            end: k.dueDate,
            done: done(k.status),
            percentDone: effPct(k),
            statusLabel: taskStatusLabel(k.status),
            assigneeEmail: k.assigneeEmail,
          })),
        };
      }
      return {
        id: t.id,
        name: name(t),
        start: t.startDate,
        end: t.dueDate,
        done: done(t.status),
        kind: "task",
        percentDone: effPct(t),
      };
    })
    .sort((a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime());

  const reqItems: GanttItem[] = requests
    .filter((r) => visible(r.subProjectId, r.createdById))
    .map((r): GanttItem => ({
      id: `req-${r.id}`,
      name: `Žádanka: ${withSubprojectName && r.subProject ? `${r.subProject.name}: ` : ""}${r.title}`,
      start: null,
      end: r.requiredDate,
      done: r.status === "schvaleno" || r.status === "zruseno",
      kind: "request",
    }));

  return [...items, ...reqItems].sort(
    (a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime(),
  );
}
