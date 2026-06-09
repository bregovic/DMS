"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

type Kind = "projectType" | "expenseCategory" | "documentType";

async function getKey(kind: Kind, id: string): Promise<string | null> {
  if (kind === "projectType") {
    const x = await prisma.projectType.findUnique({ where: { id }, select: { key: true } });
    return x?.key ?? null;
  }
  if (kind === "expenseCategory") {
    const x = await prisma.expenseCategory.findUnique({ where: { id }, select: { key: true } });
    return x?.key ?? null;
  }
  const x = await prisma.documentType.findUnique({ where: { id }, select: { key: true } });
  return x?.key ?? null;
}

async function usedCount(kind: Kind, key: string): Promise<number> {
  if (kind === "projectType") return prisma.project.count({ where: { type: key } });
  if (kind === "expenseCategory") return prisma.expense.count({ where: { category: key } });
  return prisma.document.count({ where: { type: key } });
}

export async function renameCodelistItem(formData: FormData) {
  await requireUser();
  const kind = String(formData.get("kind")) as Kind;
  const id = String(formData.get("id"));
  const label = String(formData.get("label") || "").trim();
  if (!label) throw new Error("Zadej název.");

  if (kind === "projectType")
    await prisma.projectType.update({ where: { id }, data: { label } });
  else if (kind === "expenseCategory")
    await prisma.expenseCategory.update({ where: { id }, data: { label } });
  else await prisma.documentType.update({ where: { id }, data: { label } });

  revalidatePath("/settings");
}

export async function deleteCodelistItem(formData: FormData) {
  await requireUser();
  const kind = String(formData.get("kind")) as Kind;
  const id = String(formData.get("id"));

  const key = await getKey(kind, id);
  if (!key) return;
  if ((await usedCount(kind, key)) > 0) {
    throw new Error("Nelze smazat – položka je používaná.");
  }

  if (kind === "projectType")
    await prisma.projectType.delete({ where: { id } });
  else if (kind === "expenseCategory")
    await prisma.expenseCategory.delete({ where: { id } });
  else await prisma.documentType.delete({ where: { id } });

  revalidatePath("/settings");
}
