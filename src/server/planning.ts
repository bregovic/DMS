import {
  TASK_DONE_STATUSES,
  taskStatusLabel,
  REQUEST_HANDLED_STATUSES,
  requestStatusLabel,
} from "@/lib/constants";
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
  requests?: { status: string; leadDays: number | null; requiredDate: Date | null }[];
};

export type PlanRequestRow = {
  id: string;
  title: string;
  startDate: Date | null;
  requiredDate: Date | null;
  status: string;
  taskId: string | null;
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
    filter?: {
      status?: "all" | "open" | "done" | "overdue";
      onlyRequests?: boolean;
      from?: Date | null;
      to?: Date | null;
    };
  },
): GanttItem[] {
  const {
    scope: sc,
    userId,
    email,
    mine = false,
    withSubprojectName = true,
    strictScope = false,
    filter = {},
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

  // procurement skluz: navázaná žádanka není vyřízená a "objednat do" prošlo
  const now = new Date();
  const t0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const procLate = (t: PlanTaskRow) =>
    (t.requests ?? []).some((r) => {
      if (REQUEST_HANDLED_STATUSES.includes(r.status)) return false;
      const base = t.startDate ?? r.requiredDate ?? null;
      if (!base) return false;
      const orderBy =
        r.leadDays != null ? new Date(base.getTime() - r.leadDays * 86400000) : base;
      return orderBy < t0;
    });

  // výběrová řízení (žádanky) navázaná na fázi → zobrazí se jako součást fáze
  const phaseIdSet = new Set(vtasks.filter((t) => t.kind === "phase").map((t) => t.id));
  const reqByPhase = new Map<string, PlanRequestRow[]>();
  for (const r of requests)
    if (r.taskId && phaseIdSet.has(r.taskId)) {
      const a = reqByPhase.get(r.taskId) ?? [];
      a.push(r);
      reqByPhase.set(r.taskId, a);
    }
  const reqChild = (r: PlanRequestRow) => ({
    id: `req-${r.id}`,
    requestId: r.id,
    title: r.title,
    start: r.startDate,
    end: r.requiredDate,
    done: REQUEST_HANDLED_STATUSES.includes(r.status),
    statusLabel: requestStatusLabel(r.status),
    assigneeEmail: null,
  });

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
          done: kids.length > 0 ? allDone : done(t.status),
          kind: "phase",
          percentDone: pct,
          procurementLate: kids.some((k) => procLate(k)),
          prereqMet: kids.length === 0 ? true : allDone,
          blocked: blockers.length > 0,
          blockedBy: blockers.map((p) => p.title),
          children: [
            ...kids.map((k) => ({
              id: k.id,
              title: k.title,
              start: k.startDate,
              end: k.dueDate,
              done: done(k.status),
              percentDone: effPct(k),
              procurementLate: procLate(k),
              statusLabel: taskStatusLabel(k.status),
              assigneeEmail: k.assigneeEmail,
            })),
            ...(reqByPhase.get(t.id) ?? []).map(reqChild),
          ],
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
        procurementLate: procLate(t),
      };
    })
    .sort((a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime());

  const visibleRequests = requests.filter((r) => visible(r.subProjectId, r.createdById));
  const requestItem = (r: PlanRequestRow): GanttItem => ({
    id: `req-${r.id}`,
    requestId: r.id,
    name: `Žádanka: ${withSubprojectName && r.subProject ? `${r.subProject.name}: ` : ""}${r.title}`,
    start: r.startDate,
    end: r.requiredDate,
    done: REQUEST_HANDLED_STATUSES.includes(r.status),
    kind: "request",
  });
  // nenavázané žádanky = samostatné milníky (navázané na fázi jsou uvnitř fáze)
  const reqItems = visibleRequests
    .filter((r) => !(r.taskId && phaseIdSet.has(r.taskId)))
    .map(requestItem);

  // při "pouze VŘ" zobraz všechna výběrová řízení jako samostatné řádky
  let top = filter.onlyRequests ? visibleRequests.map(requestItem) : [...items, ...reqItems];

  // filtr stavu
  const st = filter.status ?? "all";
  if (st !== "all") {
    top = top.filter((it) => {
      const overdue = !it.done && !!it.end && it.end.getTime() < t0.getTime();
      if (st === "open") return !it.done;
      if (st === "done") return !!it.done;
      return overdue; // "overdue"
    });
  }
  // filtr období (překryv s rozmezím)
  if (filter.from || filter.to) {
    top = top.filter((it) => {
      const s = it.start ?? it.end;
      const e = it.end ?? it.start;
      if (!s || !e) return false;
      if (filter.from && e < filter.from) return false;
      if (filter.to && s > filter.to) return false;
      return true;
    });
  }

  return top.sort((a, b) => (a.start ?? a.end)!.getTime() - (b.start ?? b.end)!.getTime());
}
