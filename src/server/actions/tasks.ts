"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, expandScope } from "@/server/access";
import { REQUEST_HANDLED_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";

function toDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function normEmail(v: FormDataEntryValue | null): string | null {
  const s = String(v || "").trim().toLowerCase();
  return s || null;
}
function toPriority(v: FormDataEntryValue | null): string | null {
  const s = String(v || "").trim();
  return ["high", "medium", "low"].includes(s) ? s : null;
}
function toInt(v: FormDataEntryValue | null): number | null {
  const s = String(v || "").trim().replace(",", ".");
  if (!s) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function toText(v: FormDataEntryValue | null): string | null {
  return String(v || "").trim() || null;
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const access = await getProjectAccess(projectId, user);
  if (!access || (access.role !== "owner" && access.role !== "active")) {
    throw new Error("Nemáš oprávnění přidávat úkoly.");
  }

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název úkolu.");

  let subProjectId = String(formData.get("subProjectId") || "") || null;
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
  }

  // Typ a vazba na fázi
  const kind = String(formData.get("kind") || "task") === "phase" ? "phase" : "task";
  let parentId: string | null = null;
  if (kind === "task") {
    const pid = String(formData.get("parentId") || "") || null;
    if (pid) {
      const phase = await prisma.task.findFirst({
        where: { id: pid, projectId, kind: "phase" },
        select: { id: true, subProjectId: true },
      });
      if (phase) {
        parentId = phase.id;
        subProjectId = phase.subProjectId ?? null; // dílčí úkol patří do stejné složky jako fáze
      }
    }
  }

  if (access.scopeSubIds) {
    const scope = await expandScope(projectId, access.scopeSubIds);
    if (!subProjectId || !scope.has(subProjectId)) {
      throw new Error("Do této složky nemáš oprávnění přidávat.");
    }
  }

  await prisma.task.create({
    data: {
      projectId,
      subProjectId,
      parentId,
      kind,
      title,
      description: String(formData.get("description") || "").trim() || null,
      assigneeEmail: normEmail(formData.get("assigneeEmail")),
      startDate: toDate(formData.get("startDate")),
      dueDate: toDate(formData.get("dueDate")),
      status: String(formData.get("status") || "todo").trim() || "todo",
      priority: toPriority(formData.get("priority")),
      profession: toText(formData.get("profession")),
      estimateDays: toInt(formData.get("estimateDays")),
      createdById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/planning");
}

async function taskCtx(id: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      createdById: true,
      assigneeEmail: true,
      kind: true,
      subProjectId: true,
    },
  });
  if (!task) throw new Error("Úkol nenalezen.");
  const access = await getProjectAccess(task.projectId, user);
  const isOwner = access?.role === "owner";
  const isCreator = task.createdById === user.id;
  const isAssignee =
    !!task.assigneeEmail && task.assigneeEmail === user.email?.toLowerCase();
  return { user, task, access, isOwner, isCreator, isAssignee };
}

export async function updateTask(formData: FormData) {
  const id = String(formData.get("id"));
  const { task, isOwner, isCreator } = await taskCtx(id);
  if (!isOwner && !isCreator) throw new Error("Tento úkol nemůžeš upravit.");

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název úkolu.");

  // Vazba na fázi lze měnit jen u běžného úkolu (ne u fáze)
  let parentUpdate: { parentId?: string | null; subProjectId?: string | null } = {
    parentId: null,
  };
  if (task.kind === "task") {
    const pid = String(formData.get("parentId") || "") || null;
    if (pid && pid !== task.id) {
      const phase = await prisma.task.findFirst({
        where: { id: pid, projectId: task.projectId, kind: "phase" },
        select: { id: true, subProjectId: true },
      });
      if (phase)
        parentUpdate = { parentId: phase.id, subProjectId: phase.subProjectId ?? null };
    }
  } else {
    parentUpdate = {}; // fáze: parent neměníme
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      title,
      description: String(formData.get("description") || "").trim() || null,
      assigneeEmail: normEmail(formData.get("assigneeEmail")),
      startDate: toDate(formData.get("startDate")),
      dueDate: toDate(formData.get("dueDate")),
      status: String(formData.get("status") || "todo").trim() || "todo",
      priority: toPriority(formData.get("priority")),
      profession: toText(formData.get("profession")),
      estimateDays: toInt(formData.get("estimateDays")),
      percentDone: Math.max(0, Math.min(100, toInt(formData.get("percentDone")) ?? 0)),
      ...parentUpdate,
    },
  });
  // Závislosti (jen u fází) – nahradí celou množinu.
  if (task.kind === "phase") {
    await saveDeps(task.id, task.projectId, formData.getAll("dependsOnId"), true);
  }
  await cascadeReschedule(task.projectId, task.id);
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
}

/** Nastaví množinu závislostí (nahradí stávající). kind="phase" → jen fáze. */
async function saveDeps(
  taskId: string,
  projectId: string,
  raw: FormDataEntryValue[],
  onlyPhases: boolean
) {
  const ids = [
    ...new Set(raw.map((v) => String(v || "").trim()).filter(Boolean)),
  ].filter((id) => id !== taskId);
  const valid = ids.length
    ? await prisma.task.findMany({
        where: { id: { in: ids }, projectId, ...(onlyPhases ? { kind: "phase" } : {}) },
        select: { id: true },
      })
    : [];
  const validIds = new Set(valid.map((t) => t.id));
  await prisma.taskDependency.deleteMany({ where: { taskId } });
  if (validIds.size) {
    await prisma.taskDependency.createMany({
      data: [...validIds].map((dependsOnId) => ({ taskId, dependsOnId })),
      skipDuplicates: true,
    });
  }
}

const DAY_MS = 86400000;
function addDaysUTC(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Smí uživatel plánovat (datumy/závislosti) tento prvek? owner / tvůrce / active-ve-scope. */
async function canPlan(
  task: { projectId: string; createdById: string; subProjectId: string | null },
  user: { id: string; email?: string | null }
) {
  const access = await getProjectAccess(task.projectId, user);
  if (!access) return false;
  if (access.role === "owner") return true;
  if (task.createdById === user.id) return true;
  if (access.role === "active") {
    if (!access.scopeSubIds) return true;
    const scope = await expandScope(task.projectId, access.scopeSubIds);
    return !!task.subProjectId && scope.has(task.subProjectId);
  }
  return false;
}

/** Najde N nejbližších dostupných dní dodavatele od data `from`. */
async function availabilityDates(vendorId: string, from: Date, need: number) {
  const avail = await prisma.vendorAvailability.findMany({
    where: { vendorId, available: true, date: { gte: from } },
    orderBy: { date: "asc" },
    take: need,
    select: { date: true },
  });
  if (!avail.length) return null;
  return {
    start: avail[0].date,
    due: avail[avail.length - 1].date,
    enough: avail.length >= need,
    got: avail.length,
  };
}

/** Přepočítá termíny fází (min/max dílčích úkolů). */
async function recomputePhaseDates(projectId: string) {
  const [phases, children] = await Promise.all([
    prisma.task.findMany({ where: { projectId, kind: "phase" }, select: { id: true, startDate: true, dueDate: true } }),
    prisma.task.findMany({ where: { projectId, kind: "task", parentId: { not: null } }, select: { parentId: true, startDate: true, dueDate: true } }),
  ]);
  const byParent = new Map<string, { startDate: Date | null; dueDate: Date | null }[]>();
  for (const c of children) {
    if (!c.parentId) continue;
    const a = byParent.get(c.parentId) ?? [];
    a.push(c);
    byParent.set(c.parentId, a);
  }
  const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
  for (const p of phases) {
    const kids = byParent.get(p.id) ?? [];
    const starts = kids.map((k) => k.startDate?.getTime()).filter((x): x is number => x != null);
    const dues = kids.map((k) => k.dueDate?.getTime()).filter((x): x is number => x != null);
    const start = starts.length ? new Date(Math.min(...starts)) : null;
    const due = dues.length ? new Date(Math.max(...dues)) : null;
    if (!same(start, p.startDate) || !same(due, p.dueDate))
      await prisma.task.update({ where: { id: p.id }, data: { startDate: start, dueDate: due } });
  }
}

/** Po změně termínu posune navazující úkoly (jen dopředu) a přepočítá fáze. */
async function cascadeReschedule(projectId: string, triggerId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, kind: "task" },
    select: {
      id: true, vendorId: true, estimateDays: true, startDate: true, dueDate: true,
      dependsOn: { select: { dependsOnId: true } },
    },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const deps = new Map(tasks.map((t) => [t.id, t.dependsOn.map((d) => d.dependsOnId).filter((x) => byId.has(x))]));
  const rev = new Map<string, string[]>(tasks.map((t) => [t.id, []]));
  for (const [id, ds] of deps) for (const d of ds) rev.get(d)!.push(id);

  // dotčené = potomci spouštěče v grafu závislostí
  const affected = new Set<string>();
  const stack = [...(rev.get(triggerId) ?? [])];
  while (stack.length) {
    const x = stack.pop()!;
    if (affected.has(x)) continue;
    affected.add(x);
    (rev.get(x) ?? []).forEach((n) => stack.push(n));
  }

  if (affected.size) {
    // topologické pořadí (Kahn) – cykly se přeskočí
    const indeg = new Map(tasks.map((t) => [t.id, deps.get(t.id)!.length]));
    const queue = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
    const order: string[] = [];
    while (queue.length) {
      const x = queue.shift()!;
      order.push(x);
      for (const n of rev.get(x) ?? []) {
        indeg.set(n, indeg.get(n)! - 1);
        if (indeg.get(n) === 0) queue.push(n);
      }
    }
    const dm = new Map(tasks.map((t) => [t.id, { start: t.startDate, due: t.dueDate }]));
    for (const id of order) {
      if (!affected.has(id)) continue;
      const t = byId.get(id)!;
      let maxPred: Date | null = null;
      for (const d of deps.get(id)!) {
        const dd = dm.get(d)?.due;
        if (dd && (!maxPred || dd > maxPred)) maxPred = dd;
      }
      if (!maxPred) continue;
      const desired = addDaysUTC(maxPred, 1);
      const cur = dm.get(id)!;
      const newStart = cur.start && cur.start > desired ? cur.start : desired;
      if (cur.start && newStart.getTime() === cur.start.getTime()) continue; // už je dost pozdě
      if (t.vendorId && t.estimateDays && t.estimateDays > 0) {
        const s = await availabilityDates(t.vendorId, newStart, t.estimateDays);
        if (s) {
          dm.set(id, { start: s.start, due: s.due });
          await prisma.task.update({ where: { id }, data: { startDate: s.start, dueDate: s.due } });
          continue;
        }
      }
      const durMs = cur.start && cur.due ? cur.due.getTime() - cur.start.getTime() : t.estimateDays ? (t.estimateDays - 1) * DAY_MS : 0;
      const newDue = new Date(newStart.getTime() + durMs);
      dm.set(id, { start: newStart, due: newDue });
      await prisma.task.update({ where: { id }, data: { startDate: newStart, dueDate: newDue } });
    }
  }
  await recomputePhaseDates(projectId);
}

/** Přepočítá termíny celé složky/projektu z fázových návazností a délek úkolů.
 *  Hotové úkoly drží svá data (kotvy); ostatní se počítají dopředu a u úkolu
 *  s dodavatelem se respektuje jeho dostupnost (nedostupné dny posunou termín). */
async function scheduleProject(projectId: string, subProjectId: string | null) {
  const tasks = await prisma.task.findMany({
    where: { projectId, ...(subProjectId ? { subProjectId } : {}) },
    select: {
      id: true, kind: true, parentId: true, estimateDays: true, status: true,
      vendorId: true, startDate: true, dueDate: true, createdAt: true,
      dependsOn: { select: { dependsOnId: true } },
    },
  });
  const phases = tasks.filter((t) => t.kind === "phase");
  const phaseIds = new Set(phases.map((p) => p.id));
  const childrenOf = new Map<string, typeof tasks>();
  for (const t of tasks)
    if (t.kind === "task" && t.parentId) {
      const a = childrenOf.get(t.parentId) ?? [];
      a.push(t);
      childrenOf.set(t.parentId, a);
    }
  for (const [, arr] of childrenOf) arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // dostupnost dodavatelů (jen volné dny), seřazené
  const vendorIds = [...new Set(tasks.map((t) => t.vendorId).filter((v): v is string => !!v))];
  const availMap = new Map<string, number[]>();
  if (vendorIds.length) {
    const rows = await prisma.vendorAvailability.findMany({
      where: { vendorId: { in: vendorIds }, available: true },
      select: { vendorId: true, date: true },
    });
    for (const r of rows) {
      const a = availMap.get(r.vendorId) ?? [];
      a.push(r.date.getTime());
      availMap.set(r.vendorId, a);
    }
    for (const [, a] of availMap) a.sort((x, y) => x - y);
  }
  // od `fromMs` najdi `dur` volných dnů dodavatele → {start,end}; null když nemá kalendář
  const bookAvail = (vendorId: string | null, fromMs: number, dur: number) => {
    if (!vendorId) return null;
    const arr = availMap.get(vendorId);
    if (!arr || !arr.length) return null;
    let i = 0;
    while (i < arr.length && arr[i] < fromMs) i++;
    const slice = arr.slice(i, i + dur);
    if (!slice.length) return null; // žádná dostupnost od cursoru → fallback na kalendář
    return { start: slice[0], end: slice[slice.length - 1] };
  };

  const pred = new Map<string, string[]>(
    phases.map((p) => [p.id, p.dependsOn.map((d) => d.dependsOnId).filter((x) => phaseIds.has(x))]),
  );
  const indeg = new Map(phases.map((p) => [p.id, pred.get(p.id)!.length]));
  const radj = new Map<string, string[]>(phases.map((p) => [p.id, []]));
  for (const p of phases) for (const pr of pred.get(p.id)!) radj.get(pr)?.push(p.id);
  const queue = phases.filter((p) => indeg.get(p.id) === 0).map((p) => p.id);
  const order: string[] = [];
  while (queue.length) {
    const x = queue.shift()!;
    order.push(x);
    for (const n of radj.get(x) ?? []) { indeg.set(n, indeg.get(n)! - 1); if (indeg.get(n) === 0) queue.push(n); }
  }
  for (const p of phases) if (!order.includes(p.id)) order.push(p.id);

  const done = (s: string) => TASK_DONE_STATUSES.includes(s);
  const now = new Date();
  const TODAY = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const phaseStart = new Map<string, number>();
  const phaseDue = new Map<string, number>();
  const upd: { id: string; start: Date; due: Date }[] = [];

  for (const pid of order) {
    const kids = childrenOf.get(pid) ?? [];
    const preds = pred.get(pid) ?? [];
    const predEnd = preds.length ? Math.max(...preds.map((x) => phaseDue.get(x) ?? TODAY)) : null;
    let cursor = predEnd != null ? predEnd + DAY_MS : TODAY;
    const dates: { start: number; end: number }[] = [];
    for (const k of kids) {
      let s: number, e: number;
      if (done(k.status) && k.dueDate) {
        s = (k.startDate ?? k.dueDate).getTime();
        e = k.dueDate.getTime();
        cursor = Math.max(cursor, e + DAY_MS);
      } else {
        const dur = Math.max(k.estimateDays ?? 1, 1);
        const av = bookAvail(k.vendorId, cursor, dur);
        if (av) { s = av.start; e = av.end; } // dle dostupnosti dodavatele
        else { s = cursor; e = s + (dur - 1) * DAY_MS; } // kalendářní dny
        cursor = e + DAY_MS;
        upd.push({ id: k.id, start: new Date(s), due: new Date(e) });
      }
      dates.push({ start: s, end: e });
    }
    if (dates.length) {
      phaseStart.set(pid, Math.min(...dates.map((d) => d.start)));
      phaseDue.set(pid, Math.max(...dates.map((d) => d.end)));
      upd.push({ id: pid, start: new Date(phaseStart.get(pid)!), due: new Date(phaseDue.get(pid)!) });
    }
  }

  for (const u of upd)
    await prisma.task.update({ where: { id: u.id }, data: { startDate: u.start, dueDate: u.due } });
}

/** Tlačítko „Přepočítat termíny". */
export async function recomputeSchedule(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const subProjectId = String(formData.get("subProjectId") || "") || null;
  const access = await getProjectAccess(projectId, user);
  if (!access || (access.role !== "owner" && access.role !== "active")) {
    throw new Error("Nemáš oprávnění plánovat.");
  }
  await scheduleProject(projectId, subProjectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/planning");
}

/** Detail prvku (fáze/úkol) pro dialog v plánování. */
export async function getTaskDetail(id: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true, title: true, kind: true, description: true, status: true,
      startDate: true, dueDate: true, assigneeEmail: true, vendorId: true,
      priority: true, profession: true, estimateDays: true, percentDone: true,
      projectId: true, subProjectId: true, createdById: true,
      dependsOn: { select: { dependsOnId: true } },
      project: { select: { ownerId: true } },
    },
  });
  if (!task) throw new Error("Prvek nenalezen.");
  const access = await getProjectAccess(task.projectId, user);
  if (!access) throw new Error("Nemáš přístup.");
  const canEdit = await canPlan(
    { projectId: task.projectId, createdById: task.createdById, subProjectId: task.subProjectId },
    user
  );

  const [candidates, vendors, linkedReqs, linkedExps, candReqs, candExps] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId: task.projectId,
        id: { not: task.id },
        ...(task.kind === "phase" ? { kind: "phase" } : { kind: "task" }),
      },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.vendor.findMany({
      where: { ownerId: task.project.ownerId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.request.findMany({
      where: { taskId: task.id },
      select: { id: true, title: true, status: true, requiredDate: true, leadDays: true, vendor: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { taskId: task.id },
      select: { id: true, title: true, amount: true },
      orderBy: { date: "desc" },
    }),
    prisma.request.findMany({
      where: { projectId: task.projectId, subProjectId: task.subProjectId, taskId: null },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { projectId: task.projectId, subProjectId: task.subProjectId, taskId: null },
      select: { id: true, title: true, amount: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  // "objednat do" = začátek úkolu − dodací lhůta; pozadu, když není vyřízeno a datum prošlo
  const now = new Date();
  const t0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const requests = linkedReqs.map((r) => {
    const base = task.startDate ?? r.requiredDate ?? null;
    const orderBy = base && r.leadDays != null ? addDaysUTC(base, -r.leadDays) : base;
    const handled = REQUEST_HANDLED_STATUSES.includes(r.status);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      vendorName: r.vendor?.name ?? null,
      leadDays: r.leadDays,
      orderBy: orderBy ? orderBy.toISOString().slice(0, 10) : null,
      late: !handled && !!orderBy && orderBy < t0,
    };
  });

  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    description: task.description,
    status: task.status,
    startDate: task.startDate ? task.startDate.toISOString().slice(0, 10) : null,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    assigneeEmail: task.assigneeEmail,
    vendorId: task.vendorId,
    priority: task.priority,
    profession: task.profession,
    estimateDays: task.estimateDays,
    percentDone: task.percentDone,
    projectId: task.projectId,
    subProjectId: task.subProjectId,
    canEdit,
    deps: task.dependsOn.map((d) => d.dependsOnId),
    candidates,
    vendors,
    requests,
    expenses: linkedExps.map((e) => ({ id: e.id, title: e.title, amount: Number(e.amount) })),
    candidateRequests: candReqs,
    candidateExpenses: candExps.map((e) => ({ id: e.id, title: e.title, amount: Number(e.amount) })),
  };
}

/** Uloží z dialogu: datumy, dodavatele a závislosti. */
export async function updateTaskPlan(formData: FormData) {
  const id = String(formData.get("id"));
  const { user, task } = await taskCtx(id);
  if (!(await canPlan(task, user))) throw new Error("Tento prvek nemůžeš upravit.");

  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
      select: { ownerId: true },
    });
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: project?.ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }

  // U fáze se termín i % počítají z úkolů – needitujeme je (recompute by je stejně přepsal).
  const isPhase = task.kind === "phase";
  const newTitle = String(formData.get("title") || "").trim();
  await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(newTitle ? { title: newTitle } : {}),
      ...(isPhase
        ? {}
        : {
            startDate: toDate(formData.get("startDate")),
            dueDate: toDate(formData.get("dueDate")),
            percentDone: Math.max(0, Math.min(100, toInt(formData.get("percentDone")) ?? 0)),
          }),
      vendorId,
      description: toText(formData.get("description")),
    },
  });
  await saveDeps(task.id, task.projectId, formData.getAll("dependsOnId"), task.kind === "phase");
  // U fáze přepočítat celý rozvrh (posune fázi za novou návaznost); u úkolu jen navazující.
  if (task.kind === "phase") await scheduleProject(task.projectId, task.subProjectId);
  else await cascadeReschedule(task.projectId, task.id);
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
}

/** Naplánuje úkol podle dostupnosti přiřazeného dodavatele a počtu dní. */
export async function scheduleTaskByAvailability(formData: FormData) {
  const id = String(formData.get("id"));
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true, projectId: true, createdById: true, subProjectId: true, vendorId: true,
      estimateDays: true,
      dependsOn: { select: { dependsOn: { select: { dueDate: true } } } },
    },
  });
  if (!task) throw new Error("Úkol nenalezen.");
  if (!(await canPlan(task, user))) throw new Error("Tento úkol nemůžeš plánovat.");
  if (!task.vendorId) throw new Error("Úkol nemá přiřazeného dodavatele.");
  const need = task.estimateDays ?? 0;
  if (need <= 0) throw new Error("Úkol nemá zadaný odhad dní.");

  // nejdřívější možný začátek: dnes, případně po termínu předchůdců
  const now = new Date();
  let earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (const d of task.dependsOn) {
    const due = d.dependsOn.dueDate;
    if (due) {
      const next = addDaysUTC(due, 1);
      if (next > earliest) earliest = next;
    }
  }

  const s = await availabilityDates(task.vendorId, earliest, need);
  if (!s) {
    throw new Error(
      "Dodavatel nemá v kalendáři žádné dostupné dny od plánovaného začátku. Doplň mu dostupnost.",
    );
  }
  await prisma.task.update({
    where: { id: task.id },
    data: { startDate: s.start, dueDate: s.due },
  });
  await cascadeReschedule(task.projectId, task.id);
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
  return {
    ok: true,
    start: s.start.toISOString().slice(0, 10),
    due: s.due.toISOString().slice(0, 10),
    enough: s.enough,
    got: s.got,
    need,
  };
}

export async function setTaskStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status") || "todo").trim() || "todo";
  const { task, isOwner, isCreator, isAssignee } = await taskCtx(id);
  if (!isOwner && !isCreator && !isAssignee) {
    throw new Error("Stav tohoto úkolu nemůžeš měnit.");
  }
  await prisma.task.update({ where: { id: task.id }, data: { status } });
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
}

export async function deleteTask(formData: FormData) {
  const id = String(formData.get("id"));
  const { task, isOwner, isCreator } = await taskCtx(id);
  if (!isOwner && !isCreator) throw new Error("Tento úkol nemůžeš smazat.");
  await prisma.task.delete({ where: { id: task.id } });
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
}
