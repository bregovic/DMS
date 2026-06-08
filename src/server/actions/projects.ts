"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

const projectSchema = z.object({
  name: z.string().min(1, "Zadej název projektu."),
  type: z.string().default("other"),
  description: z.string().optional(),
  color: z.string().default("#6366f1"),
});

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") ?? "other",
    description: formData.get("description") || undefined,
    color: formData.get("color") ?? "#6366f1",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Neplatné údaje.");
  }

  const project = await prisma.project.create({
    data: { ...parsed.data, ownerId: user.id },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function deleteProject(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));

  // deleteMany s ownerId = autorizace (cizí projekt se nesmaže)
  await prisma.project.deleteMany({ where: { id, ownerId: user.id } });

  revalidatePath("/projects");
  redirect("/projects");
}
