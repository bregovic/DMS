"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole } from "@/server/access";
import { storage } from "@/lib/storage";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function createExpense(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  const role = await getProjectRole(projectId, user);
  if (role !== "owner" && role !== "active") {
    throw new Error("Nemáš oprávnění přidávat do tohoto projektu.");
  }

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  // Dodavatel (komu výdaj patří) – musí být z adresáře vlastníka projektu
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: project.ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }

  const amountMode = String(formData.get("amountMode") || "fixed");
  let amount: number | null;
  let hours: number | null = null;
  let rate: number | null = null;

  if (amountMode === "hourly") {
    hours = num(formData.get("hours"));
    rate = num(formData.get("rate"));
    if (!hours || hours <= 0 || !rate || rate <= 0) {
      throw new Error("Zadej počet hodin a hodinovou sazbu.");
    }
    amount = Math.round(hours * rate * 100) / 100;
    // Ulož sazbu k dodavateli (návrh pro příště)
    if (vendorId) {
      await prisma.vendor
        .update({ where: { id: vendorId }, data: { hourlyRate: rate } })
        .catch(() => {});
    }
  } else {
    amount = num(formData.get("amount"));
    if (!amount || amount <= 0) throw new Error("Zadej částku.");
  }

  const dateStr = String(formData.get("date") || "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const status = role === "owner" ? "approved" : "for_approval";

  const expense = await prisma.expense.create({
    data: {
      projectId,
      title,
      kind: String(formData.get("kind") || "expense"),
      category: String(formData.get("category") || "other"),
      currency: String(formData.get("currency") || "CZK"),
      description: String(formData.get("description") || "").trim() || null,
      amount,
      hours,
      rate,
      date: isNaN(date.getTime()) ? new Date() : date,
      vendorId,
      status,
      createdById: user.id,
    },
    select: { id: true },
  });

  // Volitelný sken přímo k položce
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await storage.save(buffer, file.name);
    await prisma.document.create({
      data: {
        projectId,
        expenseId: expense.id,
        fileName: key,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        uploadedById: user.id,
      },
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}

export async function approveExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if ((await getProjectRole(projectId, user)) !== "owner") {
    throw new Error("Schvalovat může jen vlastník projektu.");
  }
  await prisma.expense.updateMany({
    where: { id, projectId },
    data: { status: "approved" },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if ((await getProjectRole(projectId, user)) !== "owner") {
    throw new Error("Mazat může jen vlastník projektu.");
  }
  await prisma.expense.deleteMany({ where: { id, projectId } });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}
