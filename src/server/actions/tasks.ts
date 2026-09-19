"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, expandScope, isManager, canWrite } from "@/server/access";
import { REQUEST_HANDLED_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";
import { calcOperation, type CalcOperation } from "@/lib/process-calc";
import { scheduleProject } from "@/server/schedule";
import { notifyTaskAssigned } from "@/server/notify";

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

/** Skutečné datumy z přechodu stavu: začátek při rozdělání (probíhá/hotovo),
 *  konec při dokončení. Realita vs. odhad v Plánování. */
function actualPatch(
  prev: { actualStart: Date | null; actualEnd: Date | null },
  newStatus: string,
): { actualStart?: Date | null; actualEnd?: Date | null } {
  const n = new Date();
  const today = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  const patch: { actualStart?: Date | null; actualEnd?: Date | null } = {};
  const started =
    newStatus === "in_progress" || newStatus === "done" || newStatus === "cancelled";
  if (started && !prev.actualStart) patch.actualStart = today;
  if (newStatus === "done") {
    if (!prev.actualEnd) patch.actualEnd = today;
  } else if (prev.actualEnd) {
    patch.actualEnd = null; // vráceno z hotového → zruš skutečný konec
  }
  return patch;
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const access = await getProjectAccess(projectId, user);
  if (!access || !canWrite(access.role)) {
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

  // Typ a vazba na fázi. "todo" = úkol mimo plánování (#28): bez fáze,
  // v Ganttu se neukazuje a přepočet termínů ho nechává být.
  const rawKind = String(formData.get("kind") || "task");
  const kind = rawKind === "phase" ? "phase" : rawKind === "todo" ? "todo" : "task";
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

  const newStatus = String(formData.get("status") || "todo").trim() || "todo";

  // Dodavatel jen z evidence vlastníka projektu - cizí id se zahodí.
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    const v = project
      ? await prisma.vendor.findFirst({
          where: { id: vendorId, ownerId: project.ownerId },
          select: { id: true },
        })
      : null;
    if (!v) vendorId = null;
  }
  const readyRaw = formData.get("ready");

  const created = await prisma.task.create({
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
      status: newStatus,
      ...actualPatch({ actualStart: null, actualEnd: null }, newStatus),
      priority: toPriority(formData.get("priority")),
      profession: toText(formData.get("profession")),
      estimateDays: toInt(formData.get("estimateDays")),
      vendorId,
      ...(readyRaw != null ? { ready: readyRaw === "1" || readyRaw === "true" } : {}),
      createdById: user.id,
    },
  });

  // Nový dílčí úkol pod fází → rovnou přepočítat rozvrh (zařadí ho podle délky).
  if (parentId) await scheduleProject(projectId, subProjectId);
  await notifyTaskAssigned([created.id], user.id);

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
      actualStart: true,
      actualEnd: true,
      project: { select: { ownerId: true } },
      vendor: { select: { email: true } },
    },
  });
  if (!task) throw new Error("Úkol nenalezen.");
  const access = await getProjectAccess(task.projectId, user);
  // spolusprávce (owner|member) smí editovat/mazat veškeré úkoly
  const isOwner = isManager(access?.role);
  const isCreator = task.createdById === user.id;
  const myEmail = user.email?.toLowerCase();
  // Řešitel je i dodavatel, kterému je úkol přidělený (#29) - smí měnit stav.
  const isAssignee =
    !!myEmail &&
    ((!!task.assigneeEmail && task.assigneeEmail === myEmail) ||
      task.vendor?.email?.toLowerCase() === myEmail);
  return { user, task, access, isOwner, isCreator, isAssignee };
}

export async function updateTask(formData: FormData) {
  const id = String(formData.get("id"));
  const { user, task, isOwner, isCreator } = await taskCtx(id);
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

  const newStatus = String(formData.get("status") || "todo").trim() || "todo";
  await prisma.task.update({
    where: { id: task.id },
    data: {
      title,
      description: String(formData.get("description") || "").trim() || null,
      assigneeEmail: normEmail(formData.get("assigneeEmail")),
      startDate: toDate(formData.get("startDate")),
      dueDate: toDate(formData.get("dueDate")),
      status: newStatus,
      ...actualPatch(task, newStatus),
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
  await notifyTaskAssigned([task.id], user.id);
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
  if (isManager(access.role)) return true;
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
    prisma.task.findMany({ where: { projectId, kind: "phase" }, select: { id: true, startDate: true, dueDate: true, dateLocked: true } }),
    prisma.task.findMany({ where: { projectId, kind: "task", parentId: { not: null } }, select: { parentId: true, startDate: true, dueDate: true } }),
  ]);
  const byParent = new Map<string, { startDate: Date | null; dueDate: Date | null }[]>();
  for (const c of children) {
    if (!c.parentId) continue;
    const a = byParent.get(c.parentId) ?? [];
    a.push(c);
    byParent.set(c.parentId, a);
  }
  const writes: ReturnType<typeof prisma.task.update>[] = [];
  for (const p of phases) {
    // Ručně uzamčená fáze (dateLocked) se nepřepisuje; ostatní fáze s dílčími úkoly
    // se přepočítají z min/max termínů dětí (drží reálný rozsah fáze).
    if (p.dateLocked) continue;
    const kids = byParent.get(p.id) ?? [];
    const starts = kids.map((k) => k.startDate?.getTime()).filter((x): x is number => x != null);
    const dues = kids.map((k) => k.dueDate?.getTime()).filter((x): x is number => x != null);
    if (!starts.length && !dues.length) continue;
    const start = starts.length ? new Date(Math.min(...starts)) : null;
    const due = dues.length ? new Date(Math.max(...dues)) : null;
    if (p.startDate?.getTime() !== start?.getTime() || p.dueDate?.getTime() !== due?.getTime()) {
      writes.push(
        prisma.task.update({ where: { id: p.id }, data: { startDate: start, dueDate: due } }),
      );
    }
  }
  if (writes.length) await prisma.$transaction(writes);
}

/** Po změně termínu posune navazující úkoly (jen dopředu) a přepočítá fáze. */
async function cascadeReschedule(projectId: string, triggerId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, kind: "task" },
    select: {
      id: true, vendorId: true, estimateDays: true, startDate: true, dueDate: true,
      dateLocked: true, status: true,
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
    const writes: ReturnType<typeof prisma.task.update>[] = [];
    for (const id of order) {
      if (!affected.has(id)) continue;
      const t = byId.get(id)!;
      // Ručně uzamčený nebo hotový úkol = kotva: neposouvá se (jen ho použijí jako předchůdce).
      if (t.dateLocked || TASK_DONE_STATUSES.includes(t.status)) continue;
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
          writes.push(
            prisma.task.update({ where: { id }, data: { startDate: s.start, dueDate: s.due } }),
          );
          continue;
        }
      }
      const durMs = cur.start && cur.due ? cur.due.getTime() - cur.start.getTime() : t.estimateDays ? (t.estimateDays - 1) * DAY_MS : 0;
      const newDue = new Date(newStart.getTime() + durMs);
      dm.set(id, { start: newStart, due: newDue });
      writes.push(
        prisma.task.update({ where: { id }, data: { startDate: newStart, dueDate: newDue } }),
      );
    }
    if (writes.length) await prisma.$transaction(writes);
  }
  await recomputePhaseDates(projectId);
}



/** Tlačítko „Přepočítat termíny". */
export async function recomputeSchedule(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const subProjectId = String(formData.get("subProjectId") || "") || null;
  const access = await getProjectAccess(projectId, user);
  if (!access || !canWrite(access.role)) {
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
      startDate: true, dueDate: true, dateLocked: true, assigneeEmail: true, vendorId: true,
      ready: true, blockNote: true, selfPerformed: true, costEstimate: true,
      operationId: true, operationParams: true,
      priority: true, profession: true, estimateDays: true, percentDone: true,
      actualStart: true, actualEnd: true,
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
  const canDelete = isManager(access.role) || task.createdById === user.id;

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
      // Jen nenamapované výdaje z AKTUÁLNÍHO subprojektu (stejně jako žádanky výše).
      where: { projectId: task.projectId, subProjectId: task.subProjectId, taskId: null },
      select: { id: true, title: true, amount: true, date: true, category: true },
      orderBy: { date: "desc" },
      take: 300,
    }),
  ]);

  // Forecast cena z katalogu: žádanky (materiál + práce) na tomto prvku;
  // u fáze i za všechny její dílčí úkoly.
  const childIds =
    task.kind === "phase"
      ? (await prisma.task.findMany({ where: { parentId: task.id }, select: { id: true } })).map((t) => t.id)
      : [];
  const costReqs = await prisma.request.findMany({
    where: { taskId: { in: [task.id, ...childIds] }, price: { not: null }, status: { not: "zruseno" } },
    select: { price: true, category: true },
  });
  let costMaterial = 0;
  let costLabor = 0;
  for (const r of costReqs) {
    const p = Number(r.price ?? 0);
    if (r.category === "prace") costLabor += p;
    else costMaterial += p;
  }
  const cost = { material: costMaterial, labor: costLabor, total: costMaterial + costLabor };

  // Reálné výdaje navázané na úkol (u fáze i na dílčí úkoly) + zbývající forecast
  // (model 1: forecast žádanek − reálné navázané výdaje, min 0).
  const realAgg = await prisma.expense.aggregate({
    where: { taskId: { in: [task.id, ...childIds] } },
    _sum: { amount: true },
  });
  const realCost = Number(realAgg._sum.amount ?? 0);
  const forecastRemaining = Math.max(0, cost.total - realCost);

  // Recept z katalogu (proklik + zadané parametry m²/m³ + odhad) – jen když
  // úkol vznikl z úkonu. Přepočítá se z aktuálních cen katalogu.
  let recipe: {
    operationId: string; code: string; name: string; unit: string; multiplier: number;
    params: { key: string; label: string; unit: string | null; value: number | null }[];
    quantity: number; laborHours: number; laborCost: number; materialCost: number; totalCost: number;
    materials: { name: string; unit: string; quantity: number; unitPrice: number; cost: number }[];
  } | null = null;
  if (task.operationId) {
    const op = await prisma.operation.findUnique({
      where: { id: task.operationId },
      include: {
        params: { orderBy: { sort: "asc" } },
        materials: { include: { material: { select: { id: true, name: true, unit: true, unitPrice: true } } } },
      },
    });
    if (op) {
      let parsed: { values?: Record<string, number>; multiplier?: number } = {};
      try { parsed = JSON.parse(task.operationParams || "{}"); } catch {}
      const values = parsed.values || {};
      const multiplier = parsed.multiplier ?? 1;
      const calcOp: CalcOperation = {
        id: op.id,
        name: op.name,
        unit: op.unit,
        quantityFormula: op.quantityFormula,
        laborFormula: op.laborFormula,
        laborRate: op.laborRate != null ? Number(op.laborRate) : null,
        params: op.params.map((p) => ({ key: p.key, defaultValue: p.defaultValue != null ? Number(p.defaultValue) : null })),
        materials: op.materials.map((r) => ({
          materialId: r.material.id,
          name: r.material.name,
          unit: r.material.unit,
          unitPrice: Number(r.material.unitPrice),
          quantityFormula: r.quantityFormula,
          wastePct: r.wastePct != null ? Number(r.wastePct) : null,
        })),
      };
      const r = calcOperation(calcOp, values, multiplier);
      recipe = {
        operationId: op.id,
        code: op.code,
        name: op.name,
        unit: op.unit,
        multiplier,
        params: op.params.map((p) => ({
          key: p.key,
          label: p.label,
          unit: p.unit,
          value: Number.isFinite(values[p.key]) ? values[p.key] : (p.defaultValue != null ? Number(p.defaultValue) : null),
        })),
        quantity: r.quantity,
        laborHours: r.laborHours,
        laborCost: r.laborCost,
        materialCost: r.materialCost,
        totalCost: r.totalCost,
        materials: r.materials.map((m) => ({ name: m.name, unit: m.unit, quantity: m.quantity, unitPrice: m.unitPrice, cost: m.cost })),
      };
    }
  }

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

  // Odhad vs realita (dny). U fáze se skutečné datumy i odhad berou z dílčích úkolů.
  let odhadDays = task.estimateDays ?? null;
  let aStart = task.actualStart;
  let aEnd = task.actualEnd;
  if (task.kind === "phase") {
    const kids = await prisma.task.findMany({
      where: { parentId: task.id },
      select: { estimateDays: true, actualStart: true, actualEnd: true },
    });
    const est = kids.reduce((s, k) => s + (k.estimateDays ?? 0), 0);
    if (est > 0) odhadDays = est;
    const ks = kids.map((k) => k.actualStart?.getTime()).filter((x): x is number => x != null);
    const ke = kids.map((k) => k.actualEnd?.getTime()).filter((x): x is number => x != null);
    if (ks.length) aStart = new Date(Math.min(...ks));
    if (ke.length) aEnd = new Date(Math.max(...ke));
  }
  const realDays =
    aStart && aEnd ? Math.round((aEnd.getTime() - aStart.getTime()) / DAY_MS) + 1 : null;
  const isoD = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    description: task.description,
    status: task.status,
    startDate: task.startDate ? task.startDate.toISOString().slice(0, 10) : null,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    dateLocked: task.dateLocked,
    childCount: childIds.length,
    assigneeEmail: task.assigneeEmail,
    vendorId: task.vendorId,
    ready: task.ready,
    blockNote: task.blockNote,
    costEstimate: task.costEstimate != null ? Number(task.costEstimate) : null,
    selfPerformed: task.selfPerformed,
    priority: task.priority,
    profession: task.profession,
    estimateDays: task.estimateDays,
    odhadDays,
    realDays,
    actualStart: isoD(aStart),
    actualEnd: isoD(aEnd),
    percentDone: task.percentDone,
    projectId: task.projectId,
    subProjectId: task.subProjectId,
    canEdit,
    canDelete,
    cost,
    real: realCost,
    forecastRemaining,
    recipe,
    deps: task.dependsOn.map((d) => d.dependsOnId),
    candidates,
    vendors,
    requests,
    expenses: linkedExps.map((e) => ({ id: e.id, title: e.title, amount: Number(e.amount) })),
    candidateRequests: candReqs,
    candidateExpenses: candExps.map((e) => ({
      id: e.id,
      title: e.title,
      amount: Number(e.amount),
      date: e.date.toISOString().slice(0, 10),
      category: e.category,
    })),
  };
}

/** Uloží z dialogu: datumy, dodavatele a závislosti. */
export async function updateTaskPlan(formData: FormData) {
  const id = String(formData.get("id"));
  const { user, task } = await taskCtx(id);
  if (!(await canPlan(task, user))) throw new Error("Tento prvek nemůžeš upravit.");

  let vendorId = String(formData.get("vendorId") || "") || null;
  // „svépomocí" = bez dodavatele, ale vědomě (stav připravenosti ho nehlásí jako chybějícího)
  const selfPerformed = vendorId === "__self";
  if (selfPerformed) vendorId = null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: task.project.ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }
  // Ruční blokace (povolení, počasí…) – jen když ji formulář posílá.
  const readiness =
    formData.get("readinessForm") === "1"
      ? {
          ready: formData.get("blocked") !== "1",
          blockNote:
            formData.get("blocked") === "1" ? toText(formData.get("blockNote")) : null,
        }
      : {};

  // dateLocked = ruční zámek termínu (zaškrtnuto v dialogu). Když je zaškrtnut,
  // automatický přepočet termín nepřepíše; jinak se blok plánuje automaticky.
  const dateLocked = String(formData.get("dateLocked") || "") === "1";
  const newTitle = String(formData.get("title") || "").trim();
  const newStatus = String(formData.get("status") || "todo").trim() || "todo";
  const newDue = toDate(formData.get("dueDate"));
  // "move" = posun (zachovat délku), "stretch" = natáhnout (přeškálovat odhady).
  const phaseMode = String(formData.get("phaseMode") || "move");
  // Začátek fáze, který nakonec zapíšeme (u fáze s úkoly ho můžeme odvodit).
  let newStart = toDate(formData.get("startDate"));

  // Fáze s dílčími úkoly: její interval řídí začátek + odhady úkolů (scheduler je
  // skládá od začátku fáze za sebou). Ruční termín se proto sám nepromítne –
  // podle režimu proto buď POSUNEME (nastavíme začátek dle změny začátku/termínu
  // a zachováme délku), nebo NATÁHNEME (přeškálujeme odhady úkolů na cílovou délku).
  if (task.kind === "phase") {
    const [cur, kids] = await Promise.all([
      prisma.task.findUnique({
        where: { id: task.id },
        select: { startDate: true, dueDate: true },
      }),
      prisma.task.findMany({
        where: { parentId: task.id },
        select: { id: true, estimateDays: true },
      }),
    ]);
    if (kids.length && cur?.startDate && cur?.dueDate) {
      const startChanged = !!newStart && newStart.getTime() !== cur.startDate.getTime();
      const dueChanged = !!newDue && newDue.getTime() !== cur.dueDate.getTime();

      if (phaseMode === "stretch" && newDue) {
        // Natáhnout: rozprostřít odhady dílčích úkolů tak, aby jejich součet
        // (a tím i délka fáze) vyplnil interval začátek→termín.
        const start = startChanged && newStart ? newStart : cur.startDate;
        const targetDays = Math.round((newDue.getTime() - start.getTime()) / DAY_MS) + 1;
        const curDays = kids.reduce((s, k) => s + Math.max(k.estimateDays ?? 1, 1), 0);
        if (targetDays > 0 && curDays > 0 && targetDays !== curDays) {
          const scale = targetDays / curDays;
          await prisma.$transaction(
            kids.map((k) =>
              prisma.task.update({
                where: { id: k.id },
                data: {
                  estimateDays: Math.max(1, Math.round(Math.max(k.estimateDays ?? 1, 1) * scale)),
                },
              }),
            ),
          );
        }
        newStart = start;
      } else {
        // Posunout: zachovat délku, jen posunout začátek – přímo dle nového
        // začátku, nebo (když se změnil jen termín) odvodit začátek z termínu.
        if (startChanged && newStart) {
          // newStart je už nastavený
        } else if (dueChanged && newDue) {
          const lenMs = cur.dueDate.getTime() - cur.startDate.getTime();
          newStart = new Date(newDue.getTime() - lenMs);
        } else {
          newStart = cur.startDate;
        }
      }
    }
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(newTitle ? { title: newTitle } : {}),
      startDate: newStart,
      dueDate: newDue,
      dateLocked,
      percentDone: Math.max(0, Math.min(100, toInt(formData.get("percentDone")) ?? 0)),
      vendorId,
      selfPerformed,
      ...readiness,
      description: toText(formData.get("description")),
      status: newStatus,
      ...actualPatch(task, newStatus),
      // Odhad nákladů (do forecastu) – jen když ho formulář posílá.
      ...(formData.get("costForm") === "1"
        ? (() => {
            const raw = String(formData.get("costEstimate") ?? "").replace(/\s/g, "").replace(",", ".");
            const v = raw ? Number(raw) : null;
            return { costEstimate: v != null && !isNaN(v) && v >= 0 ? v : null };
          })()
        : {}),
      // Skutečné datumy zadané ručně (podle skutečnosti) mají přednost.
      ...(formData.get("actualForm") === "1"
        ? {
            ...(toDate(formData.get("actualStart")) ? { actualStart: toDate(formData.get("actualStart")) } : {}),
            ...(toDate(formData.get("actualEnd")) ? { actualEnd: toDate(formData.get("actualEnd")) } : {}),
          }
        : {}),
    },
  });
  await saveDeps(task.id, task.projectId, formData.getAll("dependsOnId"), task.kind === "phase");
  // Přepočítat rozvrh celé složky: uzamčené/hotové bloky drží data, ostatní se
  // (i samostatné úkoly) naplánují dle dodavatele a navazující se posunou.
  await scheduleProject(task.projectId, task.subProjectId);
  await notifyTaskAssigned([task.id], user.id);
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
  // Naplánováno automaticky → zámek vypneme (přepočet smí blok dál posouvat).
  await prisma.task.update({
    where: { id: task.id },
    data: { startDate: s.start, dueDate: s.due, dateLocked: false },
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
  await prisma.task.update({
    where: { id: task.id },
    data: { status, ...actualPatch(task, status) },
  });
  // Plán podle skutečnosti: hotovo dřív/později nebo rozpracováno posune navazující.
  if (task.kind !== "todo") await scheduleProject(task.projectId, task.subProjectId);
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
  revalidatePath("/ukoly");
}

/**
 * Rychlá úprava položky todo listu (#28) – jedno pole na klik.
 *
 * Todo se upravuje přímo v řádku (připraveno, priorita, dodavatel, název),
 * ne přes plný formulář úkolu: ten je stavěný na plánování a pro "koupit
 * hmoždinky" je zbytečně těžký.
 */
export async function updateTodo(formData: FormData) {
  const id = String(formData.get("id"));
  const { user, task, isOwner, isCreator, isAssignee } = await taskCtx(id);
  if (!isOwner && !isCreator && !isAssignee) {
    throw new Error("Tento úkol nemůžeš upravit.");
  }

  const data: {
    ready?: boolean;
    priority?: string | null;
    vendorId?: string | null;
    title?: string;
  } = {};

  if (formData.has("ready")) {
    const r = String(formData.get("ready"));
    data.ready = r === "1" || r === "true";
  }
  if (formData.has("priority")) data.priority = toPriority(formData.get("priority"));
  if (formData.has("title")) {
    const title = String(formData.get("title") || "").trim();
    if (!title) throw new Error("Zadej název úkolu.");
    data.title = title;
  }
  // Přidělit dodavatele smí jen ten, kdo úkol spravuje - ne sám dodavatel.
  if (formData.has("vendorId") && (isOwner || isCreator)) {
    let vendorId = String(formData.get("vendorId") || "") || null;
    if (vendorId) {
      const v = await prisma.vendor.findFirst({
        where: { id: vendorId, ownerId: task.project.ownerId },
        select: { id: true },
      });
      if (!v) vendorId = null;
    }
    data.vendorId = vendorId;
  }

  await prisma.task.update({ where: { id: task.id }, data });
  if (data.vendorId) await notifyTaskAssigned([task.id], user.id);
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/ukoly");
}

export async function deleteTask(formData: FormData) {
  const id = String(formData.get("id"));
  const { task, isOwner, isCreator } = await taskCtx(id);
  if (!isOwner && !isCreator) throw new Error("Tento úkol nemůžeš smazat.");
  await prisma.task.delete({ where: { id: task.id } });
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
}

/**
 * Hromadná úprava úkolů ze seznamu (zaškrtnuté řádky): stav a/nebo dodavatel.
 *
 * Prázdná hodnota = neměnit. Dodavatel "__none" = odebrat, "__self" = svépomocí.
 * Upraví jen úkoly, které by uživatel mohl upravit i jednotlivě (správce nebo
 * autor); ostatní přeskočí a vrátí jejich počet.
 */
export async function bulkUpdateTasks(formData: FormData) {
  const user = await requireUser();
  // projekt je nepovinný – v Moje úkoly jsou vybrané úkoly z různých projektů
  const projectId = String(formData.get("projectId") || "") || null;
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const status = String(formData.get("status") || "").trim();
  const vendorRaw = String(formData.get("vendorId") || "").trim();
  if (ids.length === 0) throw new Error("Nevybral jsi žádný úkol.");
  if (!status && !vendorRaw) throw new Error("Vyber stav nebo dodavatele.");

  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, ...(projectId ? { projectId } : {}) },
    select: {
      id: true,
      projectId: true,
      createdById: true,
      assigneeEmail: true,
      actualStart: true,
      actualEnd: true,
      kind: true,
      subProjectId: true,
      vendor: { select: { email: true } },
      project: { select: { ownerId: true } },
    },
  });

  // Oprávnění po úkolech: dodavatele mění správce nebo autor, stav i řešitel
  // (dodavatel podle e-mailu) – stejně jako v řádku úkolu.
  const myEmail = user.email?.toLowerCase();
  const roles = new Map<string, Awaited<ReturnType<typeof getProjectAccess>>>();
  for (const pid of new Set(tasks.map((t) => t.projectId))) roles.set(pid, await getProjectAccess(pid, user));
  const canEdit = (t: (typeof tasks)[number]) => isManager(roles.get(t.projectId)?.role) || t.createdById === user.id;
  const canStatus = (t: (typeof tasks)[number]) =>
    canEdit(t) ||
    (!!myEmail && (t.assigneeEmail?.toLowerCase() === myEmail || t.vendor?.email?.toLowerCase() === myEmail));

  let vendorFor: ((ownerId: string) => { vendorId: string | null; selfPerformed: boolean } | null) | null = null;
  if (vendorRaw === "__none") vendorFor = () => ({ vendorId: null, selfPerformed: false });
  else if (vendorRaw === "__self") vendorFor = () => ({ vendorId: null, selfPerformed: true });
  else if (vendorRaw) {
    const v = await prisma.vendor.findUnique({ where: { id: vendorRaw }, select: { id: true, ownerId: true } });
    if (!v) throw new Error("Dodavatel nenalezen.");
    // dodavatel musí být z evidence vlastníka projektu
    vendorFor = (ownerId) => (ownerId === v.ownerId ? { vendorId: v.id, selfPerformed: false } : null);
  }

  const updates: { t: (typeof tasks)[number]; data: Record<string, unknown> }[] = [];
  for (const t of tasks) {
    const data: Record<string, unknown> = {};
    if (status && canStatus(t)) Object.assign(data, { status, ...actualPatch(t, status) });
    if (vendorFor && canEdit(t)) {
      const vp = vendorFor(t.project.ownerId);
      if (vp) Object.assign(data, vp);
    }
    if (Object.keys(data).length) updates.push({ t, data });
  }
  await prisma.$transaction(updates.map(({ t, data }) => prisma.task.update({ where: { id: t.id }, data })));

  const assigned = updates.filter((u) => u.data.vendorId).map((u) => u.t.id);
  if (assigned.length) await notifyTaskAssigned(assigned, user.id);
  // Změna stavu mění skutečnost → přepočítat plán dotčených složek.
  if (status) {
    const groups = new Map<string, { projectId: string; sub: string | null }>();
    for (const { t } of updates)
      if (t.kind !== "todo") groups.set(`${t.projectId}|${t.subProjectId ?? ""}`, { projectId: t.projectId, sub: t.subProjectId });
    for (const g of groups.values()) await scheduleProject(g.projectId, g.sub);
  }
  for (const pid of new Set(updates.map((u) => u.t.projectId))) revalidatePath(`/projects/${pid}`);
  revalidatePath("/planning");
  revalidatePath("/ukoly");
  return { updated: updates.length, skipped: ids.length - updates.length };
}

/**
 * Tažení pruhu v Ganttu: posun (move) nebo změna délky (resize) o celé dny.
 *
 * Posun termín zafixuje (dateLocked) – u fáze to připne její začátek a dílčí
 * úkoly se naplánují od něj. Změna délky přepíše odhad dní. Pak se přepočítá
 * celý plán, takže se navazující práce posunou samy.
 */
export async function moveTaskDates(formData: FormData) {
  const id = String(formData.get("id"));
  const days = Math.round(Number(formData.get("days")) || 0);
  const mode = formData.get("mode") === "resize" ? "resize" : "move";
  if (!days) return;
  const { user, task } = await taskCtx(id);
  if (!(await canPlan(task, user))) throw new Error("Tento prvek nemůžeš přeplánovat.");
  const t = await prisma.task.findUnique({
    where: { id: task.id },
    select: { startDate: true, dueDate: true, kind: true, _count: { select: { children: true } } },
  });
  if (!t?.startDate && !t?.dueDate) throw new Error("Prvek nemá termín.");
  const DAY = 86400000;
  const s0 = (t.startDate ?? t.dueDate)!.getTime();
  const e0 = (t.dueDate ?? t.startDate)!.getTime();

  if (mode === "move") {
    await prisma.task.update({
      where: { id: task.id },
      data: { startDate: new Date(s0 + days * DAY), dueDate: new Date(e0 + days * DAY), dateLocked: true },
    });
  } else {
    if (t.kind === "phase" && t._count.children > 0) throw new Error("Délka fáze se řídí jejími úkoly.");
    const e = Math.max(s0, e0 + days * DAY);
    await prisma.task.update({
      where: { id: task.id },
      data: { dueDate: new Date(e), estimateDays: Math.round((e - s0) / DAY) + 1 },
    });
  }
  await scheduleProject(task.projectId, task.subProjectId);
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
}
