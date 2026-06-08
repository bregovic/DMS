"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

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
