"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, expandScope } from "@/server/access";

type SUser = { id: string; email?: string | null };

function toInt(v: FormDataEntryValue | null): number | null {
  const s = String(v || "").trim().replace(",", ".");
  if (!s) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function toAmount(v: FormDataEntryValue | null): number {
  const n = parseFloat(String(v || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function toDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Načte úkol a ověří, že na něj uživatel smí (owner / tvůrce / active-ve-scope). */
async function loadTaskForPlan(taskId: string, user: SUser) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true, subProjectId: true, startDate: true, createdById: true },
  });
  if (!task) throw new Error("Úkol nenalezen.");
  const access = await getProjectAccess(task.projectId, user);
  let ok = false;
  if (access) {
    if (access.role === "owner" || task.createdById === user.id) ok = true;
    else if (access.role === "active") {
      if (!access.scopeSubIds) ok = true;
      else {
        const scope = await expandScope(task.projectId, access.scopeSubIds);
        ok = !!task.subProjectId && scope.has(task.subProjectId);
      }
    }
  }
  if (!ok) throw new Error("Na tento úkol nemáš oprávnění.");
  return task;
}

function done(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/planning");
}

// ---- ŽÁDANKY ----

export async function createRequestForTask(formData: FormData) {
  const user = await requireUser();
  const task = await loadTaskForPlan(String(formData.get("taskId")), user);
  const title = String(formData.get("title") || "").trim() || task.title;
  await prisma.request.create({
    data: {
      projectId: task.projectId,
      title,
      subProjectId: task.subProjectId,
      taskId: task.id,
      requiredDate: task.startDate,
      leadDays: toInt(formData.get("leadDays")),
      status: "poptavka",
      createdById: user.id,
    },
  });
  done(task.projectId);
}

export async function linkRequestToTask(formData: FormData) {
  const user = await requireUser();
  const task = await loadTaskForPlan(String(formData.get("taskId")), user);
  const requestId = String(formData.get("requestId"));
  await prisma.request.updateMany({
    where: { id: requestId, projectId: task.projectId },
    data: { taskId: task.id, requiredDate: task.startDate ?? undefined },
  });
  done(task.projectId);
}

export async function unlinkRequestFromTask(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("requestId"));
  const req = await prisma.request.findUnique({ where: { id }, select: { projectId: true, taskId: true } });
  if (!req?.taskId) return;
  await loadTaskForPlan(req.taskId, user);
  await prisma.request.update({ where: { id }, data: { taskId: null } });
  done(req.projectId);
}

export async function setLinkedRequestStatus(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("requestId"));
  const status = String(formData.get("status") || "").trim();
  const req = await prisma.request.findUnique({ where: { id }, select: { projectId: true, taskId: true, vendorId: true } });
  if (!req) throw new Error("Žádanka nenalezena.");
  const access = await getProjectAccess(req.projectId, user);
  if (access?.role !== "owner") {
    if (req.taskId) await loadTaskForPlan(req.taskId, user);
    else throw new Error("Nemáš oprávnění.");
  }
  await prisma.request.update({ where: { id }, data: { status } });
  done(req.projectId);
}

// ---- VÝDAJE ----

export async function createExpenseForTask(formData: FormData) {
  const user = await requireUser();
  const task = await loadTaskForPlan(String(formData.get("taskId")), user);
  const title = String(formData.get("title") || "").trim() || task.title;
  await prisma.expense.create({
    data: {
      projectId: task.projectId,
      title,
      amount: toAmount(formData.get("amount")),
      subProjectId: task.subProjectId,
      taskId: task.id,
      date: toDate(formData.get("date")) ?? new Date(),
      createdById: user.id,
    },
  });
  done(task.projectId);
}

export async function linkExpenseToTask(formData: FormData) {
  const user = await requireUser();
  const task = await loadTaskForPlan(String(formData.get("taskId")), user);
  const expenseId = String(formData.get("expenseId"));
  await prisma.expense.updateMany({
    where: { id: expenseId, projectId: task.projectId },
    data: { taskId: task.id },
  });
  done(task.projectId);
}

export async function unlinkExpenseFromTask(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("expenseId"));
  const exp = await prisma.expense.findUnique({ where: { id }, select: { projectId: true, taskId: true } });
  if (!exp?.taskId) return;
  await loadTaskForPlan(exp.taskId, user);
  await prisma.expense.update({ where: { id }, data: { taskId: null } });
  done(exp.projectId);
}
