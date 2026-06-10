"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { slugifyType } from "@/server/project-types";

const projectSchema = z.object({
  name: z.string().min(1, "Zadej název projektu."),
  description: z.string().optional(),
});

export async function createProject(formData: FormData) {
  const user = await requireUser();

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Neplatné údaje.");
  }

  // Typ: existující klíč, nebo nově zadaný vlastní typ (přidá se do číselníku)
  let type = String(formData.get("type") || "other");
  if (type === "__new__") {
    const label = String(formData.get("newType") || "").trim();
    if (!label) throw new Error("Zadej název nového typu.");
    const key = slugifyType(label);
    await prisma.projectType.upsert({
      where: { key },
      update: { label },
      create: { key, label },
    });
    type = key;
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      type,
      ownerId: user.id,
    },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const project = await prisma.project.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true },
  });
  if (!project) throw new Error("Nemáš oprávnění.");

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Zadej název projektu.");

  // Typ: existující klíč, nebo nově zadaný vlastní typ
  let type = String(formData.get("type") || "other");
  if (type === "__new__") {
    const label = String(formData.get("newType") || "").trim();
    if (!label) throw new Error("Zadej název nového typu.");
    const key = slugifyType(label);
    await prisma.projectType.upsert({
      where: { key },
      update: { label },
      create: { key, label },
    });
    type = key;
  }

  await prisma.project.update({
    where: { id },
    data: {
      name,
      type,
      description: String(formData.get("description") || "").trim() || null,
      defaultKind: String(formData.get("defaultKind") || "").trim() || null,
      defaultCategory: String(formData.get("defaultCategory") || "").trim() || null,
      defaultCurrency: String(formData.get("defaultCurrency") || "").trim() || null,
    },
  });

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function deleteProject(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));

  // deleteMany s ownerId = autorizace (cizí projekt se nesmaže)
  await prisma.project.deleteMany({ where: { id, ownerId: user.id } });

  revalidatePath("/projects");
  redirect("/projects");
}

export async function addVendorToProject(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const vendorId = String(formData.get("vendorId"));
  if (!vendorId) return;

  const [project, vendor] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id },
      select: { id: true },
    }),
    prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: user.id },
      select: { id: true },
    }),
  ]);
  if (!project || !vendor) throw new Error("Nenalezeno.");

  await prisma.project.update({
    where: { id: projectId },
    data: { vendors: { connect: { id: vendorId } } },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeVendorFromProject(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const vendorId = String(formData.get("vendorId"));

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id },
    select: { id: true },
  });
  if (!project) throw new Error("Nenalezeno.");

  await prisma.project.update({
    where: { id: projectId },
    data: { vendors: { disconnect: { id: vendorId } } },
  });
  revalidatePath(`/projects/${projectId}`);
}
