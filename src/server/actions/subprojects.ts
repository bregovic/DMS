"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, getProjectAccess, expandScope, isManager, canWrite } from "@/server/access";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function createSubProject(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const access = await getProjectAccess(projectId, user);
  if (!access || !canWrite(access.role)) {
    throw new Error("Nemáš oprávnění.");
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Zadej název subprojektu.");

  let parentId = String(formData.get("parentId") || "") || null;
  if (parentId) {
    const parent = await prisma.subProject.findFirst({
      where: { id: parentId, projectId },
      select: { id: true },
    });
    if (!parent) parentId = null;
  }

  // Per-subprojekt přístup: smí zakládat jen uvnitř své složky
  if (access.scopeSubIds) {
    const scope = await expandScope(projectId, access.scopeSubIds);
    if (!parentId || !scope.has(parentId)) {
      throw new Error("Subprojekt smíš založit jen uvnitř své složky.");
    }
  }

  await prisma.subProject.create({
    data: {
      projectId,
      parentId,
      name,
      description: String(formData.get("description") || "").trim() || null,
      budget: num(formData.get("budget")),
      createdById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function updateSubProject(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  const role = await getProjectRole(projectId, user);
  const sub = await prisma.subProject.findFirst({
    where: { id, projectId },
    select: { createdById: true },
  });
  if (!sub) throw new Error("Subprojekt nenalezen.");
  if (!isManager(role) && sub.createdById !== user.id) {
    throw new Error("Nemáš oprávnění upravit tento subprojekt.");
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Zadej název subprojektu.");

  await prisma.subProject.update({
    where: { id },
    data: {
      name,
      description: String(formData.get("description") || "").trim() || null,
      budget: num(formData.get("budget")),
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteSubProject(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  const role = await getProjectRole(projectId, user);
  const sub = await prisma.subProject.findFirst({
    where: { id, projectId },
    select: { createdById: true },
  });
  if (!sub) return;

  const allowed = isManager(role) || sub.createdById === user.id;
  if (!allowed) throw new Error("Nemáš oprávnění smazat tento subprojekt.");

  // Smaže i vnořené (cascade); položky se odpojí (subProjectId -> null).
  await prisma.subProject.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}`);
}
