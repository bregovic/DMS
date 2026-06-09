"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole } from "@/server/access";
import { resolveDocTypeKey } from "@/server/document-types";

const MAX_UPLOAD = 8 * 1024 * 1024; // 8 MB

/** Připojí sken k existující položce (výdaji). Owner ke všem, aktivní dodavatel jen ke svým. */
export async function attachExpenseScan(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const expenseId = String(formData.get("expenseId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Vyber soubor.");
  }
  if (file.size > MAX_UPLOAD) {
    throw new Error("Soubor je větší než 8 MB.");
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

  if (file.size > MAX_UPLOAD) {
    throw new Error("Soubor je větší než 8 MB.");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id },
    select: { id: true, ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  let docType = String(formData.get("type") || "other");
  if (docType === "__new__") {
    docType = await resolveDocTypeKey(String(formData.get("newType") || ""));
  }
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

  const doc = await prisma.document.findUnique({
    where: { id },
    include: { project: { select: { ownerId: true } } },
  });
  if (!doc) return;

  // Owner smaže cokoliv; aktivní dodavatel jen to, co sám nahrál.
  let allowed = doc.project.ownerId === user.id;
  if (!allowed && doc.uploadedById === user.id) {
    const role = await getProjectRole(doc.projectId, user);
    allowed = role === "active" || role === "owner";
  }
  if (!allowed) return;

  await storage.delete(doc.fileName);
  await prisma.document.delete({ where: { id: doc.id } });

  revalidatePath(`/projects/${doc.projectId}`);
}
