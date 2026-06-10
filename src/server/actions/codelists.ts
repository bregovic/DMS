"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { slugifyType } from "@/server/project-types";
import { slugifyCategory } from "@/server/expense-categories";
import { slugifyDocType } from "@/server/document-types";
import { slugifyStatus } from "@/server/statuses";

type Kind =
  | "projectType"
  | "expenseCategory"
  | "documentType"
  | "requestStatus"
  | "offerStatus"
  | "expenseStatus"
  | "taskStatus";

const STATUS_SCOPE: Partial<Record<Kind, "request" | "offer" | "expense" | "task">> = {
  requestStatus: "request",
  offerStatus: "offer",
  expenseStatus: "expense",
  taskStatus: "task",
};

async function getKey(kind: Kind, id: string): Promise<string | null> {
  if (kind === "projectType")
    return (await prisma.projectType.findUnique({ where: { id }, select: { key: true } }))?.key ?? null;
  if (kind === "expenseCategory")
    return (await prisma.expenseCategory.findUnique({ where: { id }, select: { key: true } }))?.key ?? null;
  if (kind === "documentType")
    return (await prisma.documentType.findUnique({ where: { id }, select: { key: true } }))?.key ?? null;
  return (await prisma.statusOption.findUnique({ where: { id }, select: { key: true } }))?.key ?? null;
}

async function usedCount(kind: Kind, key: string): Promise<number> {
  if (kind === "projectType") return prisma.project.count({ where: { type: key } });
  if (kind === "expenseCategory") return prisma.expense.count({ where: { category: key } });
  if (kind === "documentType") return prisma.document.count({ where: { type: key } });
  if (kind === "requestStatus") return prisma.request.count({ where: { status: key } });
  if (kind === "offerStatus") return prisma.offer.count({ where: { status: key } });
  if (kind === "expenseStatus") return prisma.expense.count({ where: { stage: key } });
  return prisma.task.count({ where: { status: key } });
}

export async function addCodelistItem(formData: FormData) {
  await requireUser();
  const kind = String(formData.get("kind")) as Kind;
  const label = String(formData.get("label") || "").trim();
  if (!label) throw new Error("Zadej název.");

  if (kind === "projectType") {
    await prisma.projectType.upsert({
      where: { key: slugifyType(label) },
      update: { label },
      create: { key: slugifyType(label), label },
    });
  } else if (kind === "expenseCategory") {
    await prisma.expenseCategory.upsert({
      where: { key: slugifyCategory(label) },
      update: { label },
      create: { key: slugifyCategory(label), label },
    });
  } else if (kind === "documentType") {
    await prisma.documentType.upsert({
      where: { key: slugifyDocType(label) },
      update: { label },
      create: { key: slugifyDocType(label), label },
    });
  } else {
    const scope = STATUS_SCOPE[kind]!;
    const key = slugifyStatus(label);
    await prisma.statusOption.upsert({
      where: { scope_key: { scope, key } },
      update: { label },
      create: { scope, key, label },
    });
  }

  revalidatePath("/settings");
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
  else if (kind === "documentType")
    await prisma.documentType.update({ where: { id }, data: { label } });
  else await prisma.statusOption.update({ where: { id }, data: { label } });

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
  else if (kind === "documentType")
    await prisma.documentType.delete({ where: { id } });
  else await prisma.statusOption.delete({ where: { id } });

  revalidatePath("/settings");
}
