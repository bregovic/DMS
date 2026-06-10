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
      title,
      description: String(formData.get("description") || "").trim() || null,
      assigneeEmail: normEmail(formData.get("assigneeEmail")),
      startDate: toDate(formData.get("startDate")),
      dueDate: toDate(formData.get("dueDate")),
      status: String(formData.get("status") || "todo").trim() || "todo",
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

  await prisma.task.update({
    where: { id: task.id },
    data: {
      title,
      description: String(formData.get("description") || "").trim() || null,
      assigneeEmail: normEmail(formData.get("assigneeEmail")),
      startDate: toDate(formData.get("startDate")),
      dueDate: toDate(formData.get("dueDate")),
      status: String(formData.get("status") || "todo").trim() || "todo",
    },
  });
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
