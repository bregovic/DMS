"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, expandScope } from "@/server/access";

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
      ...parentUpdate,
    },
  });
  // Závislosti (jen u fází) – nahradí celou množinu.
  if (task.kind === "phase") {
    await saveDeps(task.id, task.projectId, formData.getAll("dependsOnId"), true);
  }
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

/** Detail prvku (fáze/úkol) pro dialog v plánování. */
export async function getTaskDetail(id: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true, title: true, kind: true, description: true, status: true,
      startDate: true, dueDate: true, assigneeEmail: true, vendorId: true,
      priority: true, profession: true, estimateDays: true,
      projectId: true, subProjectId: true, createdById: true,
      dependsOn: { select: { dependsOnId: true } },
      project: { select: { ownerId: true } },
    },
  });
  if (!task) throw new Error("Prvek nenalezen.");
  const access = await getProjectAccess(task.projectId, user);
  if (!access) throw new Error("Nemáš přístup.");
  const canEdit = access.role === "owner" || task.createdById === user.id || false;

  const [candidates, vendors, requests, expenses] = await Promise.all([
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
      where: { projectId: task.projectId, subProjectId: task.subProjectId },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { projectId: task.projectId, subProjectId: task.subProjectId },
      select: { id: true, title: true, amount: true },
      orderBy: { date: "desc" },
      take: 30,
    }),
  ]);

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
    projectId: task.projectId,
    subProjectId: task.subProjectId,
    canEdit,
    deps: task.dependsOn.map((d) => d.dependsOnId),
    candidates,
    vendors,
    requests,
    expenses: expenses.map((e) => ({ id: e.id, title: e.title, amount: Number(e.amount) })),
  };
}

/** Uloží z dialogu: datumy, dodavatele a závislosti. */
export async function updateTaskPlan(formData: FormData) {
  const id = String(formData.get("id"));
  const { task, isOwner, isCreator } = await taskCtx(id);
  if (!isOwner && !isCreator) throw new Error("Tento prvek nemůžeš upravit.");

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

  await prisma.task.update({
    where: { id: task.id },
    data: {
      startDate: toDate(formData.get("startDate")),
      dueDate: toDate(formData.get("dueDate")),
      vendorId,
    },
  });
  await saveDeps(task.id, task.projectId, formData.getAll("dependsOnId"), task.kind === "phase");
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
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
