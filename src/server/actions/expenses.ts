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

  let subProjectId = String(formData.get("subProjectId") || "") || null;
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
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

  const paid =
    formData.get("paid") === "on" || formData.get("paid") === "true";
  const dueStr = String(formData.get("dueDate") || "");
  const due = dueStr ? new Date(dueStr) : null;
  const variableSymbol =
    String(formData.get("variableSymbol") || "").trim() || null;

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
      paid,
      dueDate: due && !isNaN(due.getTime()) ? due : null,
      variableSymbol,
      stage: String(formData.get("stage") || "").trim() || null,
      vendorId,
      subProjectId,
      status,
      createdById: user.id,
    },
    select: { id: true },
  });

  // Volitelný sken přímo k položce
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Sken je větší než 8 MB.");
    }
    const docType = String(formData.get("scanType") || "receipt");
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await storage.save(
      buffer,
      file.name,
      `${project.ownerId}/${projectId}/${docType}`,
    );
    await prisma.document.create({
      data: {
        projectId,
        expenseId: expense.id,
        fileName: key,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        type: docType,
        uploadedById: user.id,
      },
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}

export async function updateExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if ((await getProjectRole(projectId, user)) !== "owner") {
    throw new Error("Upravit výdaj může jen vlastník projektu.");
  }

  const existing = await prisma.expense.findFirst({
    where: { id, projectId },
    select: { id: true, project: { select: { ownerId: true } } },
  });
  if (!existing) throw new Error("Výdaj nenalezen.");
  const ownerId = existing.project.ownerId;

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }

  let subProjectId = String(formData.get("subProjectId") || "") || null;
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
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
  const paid =
    formData.get("paid") === "on" || formData.get("paid") === "true";
  const dueStr = String(formData.get("dueDate") || "");
  const due = dueStr ? new Date(dueStr) : null;
  const variableSymbol =
    String(formData.get("variableSymbol") || "").trim() || null;

  await prisma.expense.update({
    where: { id },
    data: {
      title,
      kind: String(formData.get("kind") || "expense"),
      category: String(formData.get("category") || "other"),
      currency: String(formData.get("currency") || "CZK"),
      description: String(formData.get("description") || "").trim() || null,
      amount,
      hours,
      rate,
      date: isNaN(date.getTime()) ? new Date() : date,
      paid,
      dueDate: due && !isNaN(due.getTime()) ? due : null,
      variableSymbol,
      stage: String(formData.get("stage") || "").trim() || null,
      vendorId,
      subProjectId,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/payments");
  revalidatePath("/vendors");
}

export async function setExpenseStage(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const stage = String(formData.get("stage") || "").trim() || null;

  if ((await getProjectRole(projectId, user)) !== "owner") {
    throw new Error("Stav výdaje mění jen vlastník projektu.");
  }
  await prisma.expense.updateMany({ where: { id, projectId }, data: { stage } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/payments");
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

export async function setExpensePaid(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const paid = String(formData.get("paid")) === "true";

  if ((await getProjectRole(projectId, user)) !== "owner") {
    throw new Error("Stav úhrady mění jen vlastník projektu.");
  }
  await prisma.expense.updateMany({ where: { id, projectId }, data: { paid } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/payments");
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
