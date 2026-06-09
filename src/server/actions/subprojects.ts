"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole } from "@/server/access";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function createSubProject(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const role = await getProjectRole(projectId, user);
  if (role !== "owner" && role !== "active") {
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

  const toDate = (key: string) => {
    const s = String(formData.get(key) || "");
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  await prisma.subProject.create({
    data: {
      projectId,
      parentId,
      name,
      description: String(formData.get("description") || "").trim() || null,
      budget: num(formData.get("budget")),
      startDate: toDate("startDate"),
      deadline: toDate("deadline"),
      createdById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/planning");
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
  if (role !== "owner" && sub.createdById !== user.id) {
    throw new Error("Nemáš oprávnění upravit tento subprojekt.");
  }

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Zadej název subprojektu.");

  const toDate = (key: string) => {
    const s = String(formData.get(key) || "");
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  // Návaznost – jen jiný subprojekt téhož projektu (a ne sám na sebe)
  let dependsOnId = String(formData.get("dependsOnId") || "") || null;
  if (dependsOnId) {
    if (dependsOnId === id) dependsOnId = null;
    else {
      const dep = await prisma.subProject.findFirst({
        where: { id: dependsOnId, projectId },
        select: { id: true },
      });
      if (!dep) dependsOnId = null;
    }
  }

  await prisma.subProject.update({
    where: { id },
    data: {
      name,
      description: String(formData.get("description") || "").trim() || null,
      budget: num(formData.get("budget")),
      startDate: toDate("startDate"),
      deadline: toDate("deadline"),
      dependsOnId,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/planning");
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

  const allowed = role === "owner" || sub.createdById === user.id;
  if (!allowed) throw new Error("Nemáš oprávnění smazat tento subprojekt.");

  // Smaže i vnořené (cascade); položky se odpojí (subProjectId -> null).
  await prisma.subProject.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}`);
}
