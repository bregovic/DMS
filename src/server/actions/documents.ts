"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole } from "@/server/access";

/** Připojí sken k existující položce (výdaji). Owner ke všem, aktivní dodavatel jen ke svým. */
export async function attachExpenseScan(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const expenseId = String(formData.get("expenseId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Vyber soubor.");
  }

  const role = await getProjectRole(projectId, user);
  if (role !== "owner" && role !== "active") {
    throw new Error("Nemáš oprávnění.");
  }

  const expense = await prisma.expense.findFirst({
    where: {
      id: expenseId,
      projectId,
      ...(role === "active" ? { createdById: user.id } : {}),
    },
    select: { id: true },
  });
  if (!expense) throw new Error("Položka nenalezena.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  const docType = String(formData.get("type") || "receipt");
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await storage.save(
    buffer,
    file.name,
    `${project.ownerId}/${projectId}/${docType}`,
  );
  await prisma.document.create({
    data: {
      projectId,
      expenseId,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType,
      uploadedById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function uploadDocument(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const expenseRaw = formData.get("expenseId");
  const expenseId = expenseRaw ? String(expenseRaw) : null;
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Vyber soubor k nahrání.");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id },
    select: { id: true, ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  const docType = String(formData.get("type") || "other");
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await storage.save(
    buffer,
    file.name,
    `${project.ownerId}/${projectId}/${docType}`,
  );

  await prisma.document.create({
    data: {
      projectId,
      expenseId,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType,
      uploadedById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteDocument(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));

  const doc = await prisma.document.findFirst({
    where: { id, project: { ownerId: user.id } },
  });
  if (!doc) return;

  await storage.delete(doc.fileName);
  await prisma.document.delete({ where: { id: doc.id } });

  revalidatePath(`/projects/${doc.projectId}`);
}
