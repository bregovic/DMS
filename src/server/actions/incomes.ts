"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, getProjectAccess, expandScope, isManager, canWrite } from "@/server/access";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function createIncome(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  const access = await getProjectAccess(projectId, user);
  if (!access || !canWrite(access.role)) {
    throw new Error("Nemáš oprávnění přidávat do tohoto projektu.");
  }

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  const amount = num(formData.get("amount"));
  if (!amount || amount <= 0) throw new Error("Zadej částku.");

  let subProjectId = String(formData.get("subProjectId") || "") || null;
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
  }

  // Per-subprojekt přístup: smí přidávat jen do své složky (a jejích pod-složek)
  if (access.scopeSubIds) {
    const scope = await expandScope(projectId, access.scopeSubIds);
    if (!subProjectId || !scope.has(subProjectId)) {
      throw new Error("Do této složky nemáš oprávnění přidávat.");
    }
  }

  const dateStr = String(formData.get("date") || "");
  const date = dateStr ? new Date(dateStr) : new Date();

  // Ochrana proti dvojímu odeslání (stejný název+částka do 20 s).
  const dup = await prisma.income.findFirst({
    where: {
      projectId,
      createdById: user.id,
      title,
      amount,
      createdAt: { gte: new Date(Date.now() - 20000) },
    },
    select: { id: true },
  });
  if (dup) {
    revalidatePath(`/projects/${projectId}`);
    return;
  }

  await prisma.income.create({
    data: {
      projectId,
      subProjectId,
      title,
      description: String(formData.get("description") || "").trim() || null,
      amount,
      currency: String(formData.get("currency") || "CZK"),
      category: String(formData.get("category") || "other"),
      date: isNaN(date.getTime()) ? new Date() : date,
      createdById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export async function updateIncome(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Upravit příjem může jen vlastník projektu.");
  }

  const existing = await prisma.income.findFirst({
    where: { id, projectId },
    select: { id: true },
  });
  if (!existing) throw new Error("Příjem nenalezen.");

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  const amount = num(formData.get("amount"));
  if (!amount || amount <= 0) throw new Error("Zadej částku.");

  let subProjectId = String(formData.get("subProjectId") || "") || null;
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
  }

  const dateStr = String(formData.get("date") || "");
  const date = dateStr ? new Date(dateStr) : new Date();

  await prisma.income.update({
    where: { id },
    data: {
      title,
      description: String(formData.get("description") || "").trim() || null,
      amount,
      currency: String(formData.get("currency") || "CZK"),
      category: String(formData.get("category") || "other"),
      date: isNaN(date.getTime()) ? new Date() : date,
      subProjectId,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export async function deleteIncome(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Mazat může jen vlastník projektu.");
  }
  await prisma.income.deleteMany({ where: { id, projectId } });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}
