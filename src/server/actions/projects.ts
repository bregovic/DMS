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

export async function deleteProject(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));

  // deleteMany s ownerId = autorizace (cizí projekt se nesmaže)
  await prisma.project.deleteMany({ where: { id, ownerId: user.id } });

  revalidatePath("/projects");
  redirect("/projects");
}
