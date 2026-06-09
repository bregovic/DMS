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

  const deadlineStr = String(formData.get("deadline") || "");
  const deadline = deadlineStr ? new Date(deadlineStr) : null;

  await prisma.subProject.create({
    data: {
      projectId,
      parentId,
      name,
      description: String(formData.get("description") || "").trim() || null,
      budget: num(formData.get("budget")),
      deadline: deadline && !isNaN(deadline.getTime()) ? deadline : null,
      createdById: user.id,
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

  const allowed = role === "owner" || sub.createdById === user.id;
  if (!allowed) throw new Error("Nemáš oprávnění smazat tento subprojekt.");

  // Smaže i vnořené (cascade); položky se odpojí (subProjectId -> null).
  await prisma.subProject.delete({ where: { id } });
  revalidatePath(`/projects/${projectId}`);
}
