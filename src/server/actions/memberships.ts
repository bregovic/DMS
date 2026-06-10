"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

function normEmail(s: string) {
  return s.trim().toLowerCase();
}

/**
 * Přístup k projektu podle e-mailu (účastník). role "active" | "reader";
 * cokoli jiného (vendor/none) přístup odebere. Jen vlastník projektu.
 */
export async function setMemberRole(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const email = normEmail(String(formData.get("email") || ""));
  const role = String(formData.get("role") || "none");
  if (!email || !email.includes("@")) throw new Error("Zadej platný e-mail.");

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id },
    select: { id: true },
  });
  if (!project) throw new Error("Nemáš oprávnění.");

  // propojení s dodavatelem (pokud takový e-mail v evidenci je) – jen informativní
  const vendor = await prisma.vendor.findFirst({
    where: { ownerId: user.id, email },
    select: { id: true },
  });

  if (role !== "active" && role !== "reader") {
    await prisma.projectMembership.deleteMany({ where: { projectId, email } });
  } else {
    await prisma.projectMembership.upsert({
      where: { projectId_email: { projectId, email } },
      update: { role, vendorId: vendor?.id ?? null },
      create: { projectId, email, role, vendorId: vendor?.id ?? null },
    });
  }
  revalidatePath(`/projects/${projectId}`);
}

/** Přístup ke složce (subprojektu) podle e-mailu. Jen vlastník. */
export async function setSubMemberRole(formData: FormData) {
  const user = await requireUser();
  const subProjectId = String(formData.get("subProjectId"));
  const email = normEmail(String(formData.get("email") || ""));
  const role = String(formData.get("role") || "none");
  if (!email || !email.includes("@")) throw new Error("Zadej platný e-mail.");

  const sub = await prisma.subProject.findUnique({
    where: { id: subProjectId },
    select: { id: true, projectId: true, project: { select: { ownerId: true } } },
  });
  if (!sub || sub.project.ownerId !== user.id) throw new Error("Nemáš oprávnění.");

  const vendor = await prisma.vendor.findFirst({
    where: { ownerId: user.id, email },
    select: { id: true },
  });

  if (role !== "active" && role !== "reader") {
    await prisma.subProjectMembership.deleteMany({ where: { subProjectId, email } });
  } else {
    await prisma.subProjectMembership.upsert({
      where: { subProjectId_email: { subProjectId, email } },
      update: { role, vendorId: vendor?.id ?? null },
      create: { subProjectId, projectId: sub.projectId, email, role, vendorId: vendor?.id ?? null },
    });
  }
  revalidatePath(`/projects/${sub.projectId}`);
}

/**
 * Nastaví roli (přístup) přiřazeného dodavatele u projektu.
 * role "vendor" = jen kontakt → členství se smaže.
 * Pouze vlastník projektu.
 */
export async function setVendorRole(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const vendorId = String(formData.get("vendorId"));
  const role = String(formData.get("role") || "vendor");

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id },
    select: { id: true },
  });
  if (!project) throw new Error("Nemáš oprávnění.");

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, ownerId: user.id },
    select: { email: true },
  });
  if (!vendor) throw new Error("Dodavatel nenalezen.");
  const email = vendor.email.toLowerCase();

  if (role === "vendor") {
    await prisma.projectMembership.deleteMany({ where: { projectId, email } });
  } else {
    await prisma.projectMembership.upsert({
      where: { projectId_email: { projectId, email } },
      update: { role, vendorId },
      create: { projectId, email, role, vendorId },
    });
  }

  revalidatePath(`/projects/${projectId}`);
}

/**
 * Nastaví roli dodavatele přímo k subprojektu (per-subprojekt přístup).
 * role "vendor" = jen kontakt → členství subprojektu se smaže. Jen vlastník.
 */
export async function setVendorSubRole(formData: FormData) {
  const user = await requireUser();
  const subProjectId = String(formData.get("subProjectId"));
  const vendorId = String(formData.get("vendorId"));
  const role = String(formData.get("role") || "vendor");

  const sub = await prisma.subProject.findUnique({
    where: { id: subProjectId },
    select: { id: true, projectId: true, project: { select: { ownerId: true } } },
  });
  if (!sub || sub.project.ownerId !== user.id) throw new Error("Nemáš oprávnění.");

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, ownerId: user.id },
    select: { email: true },
  });
  if (!vendor) throw new Error("Dodavatel nenalezen.");
  const email = vendor.email.toLowerCase();

  if (role === "vendor") {
    await prisma.subProjectMembership.deleteMany({ where: { subProjectId, email } });
  } else {
    await prisma.subProjectMembership.upsert({
      where: { subProjectId_email: { subProjectId, email } },
      update: { role, vendorId },
      create: { subProjectId, projectId: sub.projectId, email, role, vendorId },
    });
  }

  revalidatePath(`/projects/${sub.projectId}`);
}
