"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

const expenseSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, "Zadej název výdaje."),
  amount: z.coerce.number().positive("Částka musí být kladná."),
  currency: z.string().default("CZK"),
  category: z.string().default("other"),
  date: z.coerce.date(),
  description: z.string().optional(),
  vendorId: z.string().optional(),
});

/** Ověří, že projekt patří uživateli. */
async function assertOwnsProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    select: { id: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");
}

export async function createExpense(formData: FormData) {
  const user = await requireUser();
  const parsed = expenseSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "CZK",
    category: formData.get("category") || "other",
    date: formData.get("date") || new Date(),
    description: formData.get("description") || undefined,
    vendorId: formData.get("vendorId") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Neplatné údaje.");
  }

  await assertOwnsProject(parsed.data.projectId, user.id);

  // Ověř, že dodavatel patří uživateli; jinak vazbu ignoruj.
  let vendorId = parsed.data.vendorId || null;
  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: user.id },
      select: { id: true },
    });
    if (!vendor) vendorId = null;
  }

  await prisma.expense.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      category: parsed.data.category,
      date: parsed.data.date,
      description: parsed.data.description,
      vendorId,
      createdById: user.id,
    },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}

export async function deleteExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  await assertOwnsProject(projectId, user.id);
  await prisma.expense.deleteMany({ where: { id, projectId } });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}
