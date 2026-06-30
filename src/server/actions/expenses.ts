"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, getProjectAccess, expandScope, isManager, canWrite } from "@/server/access";
import { storage } from "@/lib/storage";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function createExpense(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  const access = await getProjectAccess(projectId, user);
  if (!access || !canWrite(access.role)) {
    throw new Error("Nemáš oprávnění přidávat do tohoto projektu.");
  }

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  // Dodavatel (komu výdaj patří) – ze sdíleného číselníku (ověříme jen existenci)
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId },
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

  // Per-subprojekt přístup: smí přidávat jen do své složky (a jejích pod-složek)
  if (access.scopeSubIds) {
    const scope = await expandScope(projectId, access.scopeSubIds);
    if (!subProjectId || !scope.has(subProjectId)) {
      throw new Error("Do této složky nemáš oprávnění přidávat.");
    }
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
  const status = "approved"; // schvalování zrušeno – vše rovnou platné

  const paid =
    formData.get("paid") === "on" || formData.get("paid") === "true";
  const dueStr = String(formData.get("dueDate") || "");
  const due = dueStr ? new Date(dueStr) : null;
  const variableSymbol =
    String(formData.get("variableSymbol") || "").trim() || null;

  // Ochrana proti dvojímu odeslání: stejný název+částka v projektu od téhož
  // uživatele během posledních 20 s považuj za duplicitu a přeskoč.
  const dup = await prisma.expense.findFirst({
    where: {
      projectId,
      createdById: user.id,
      title,
      amount,
      createdAt: { gte: new Date(Date.now() - 20000) },
    },
    select: { id: true },
  });
  if (dup) {
    revalidatePath(`/projects/${projectId}`);
    return;
  }

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

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Upravit výdaj může jen vlastník projektu.");
  }

  const existing = await prisma.expense.findFirst({
    where: { id, projectId },
    select: { id: true },
  });
  if (!existing) throw new Error("Výdaj nenalezen.");

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId },
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

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Stav výdaje mění jen vlastník projektu.");
  }
  await prisma.expense.updateMany({ where: { id, projectId }, data: { stage } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/payments");
}

// Hromadná akce nad vybranými výdaji (vlastník). op: stage | paid | unpaid | delete
export async function bulkUpdateExpenses(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const op = String(formData.get("op") || "");
  const ids = String(formData.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Hromadnou změnu může provést jen vlastník projektu.");
  }
  if (ids.length === 0) return;

  const where = { id: { in: ids }, projectId };
  if (op === "delete") {
    // smaž i přílohy z úložiště (R2)
    const docs = await prisma.document.findMany({
      where: { expenseId: { in: ids } },
      select: { fileName: true },
    });
    await Promise.all(docs.map((d) => storage.delete(d.fileName)));
    await prisma.document.deleteMany({ where: { expenseId: { in: ids } } });
    await prisma.expense.deleteMany({ where });
  } else if (op === "paid") {
    await prisma.expense.updateMany({ where, data: { paid: true } });
  } else if (op === "unpaid") {
    await prisma.expense.updateMany({ where, data: { paid: false } });
  } else if (op === "stage") {
    const stage = String(formData.get("stage") || "").trim() || null;
    await prisma.expense.updateMany({ where, data: { stage } });
  } else {
    throw new Error("Neznámá operace.");
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/payments");
}

export async function approveExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
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

  if (!isManager(await getProjectRole(projectId, user))) {
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

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Mazat může jen vlastník projektu.");
  }
  // smaž i připojené skeny z úložiště (R2)
  const docs = await prisma.document.findMany({
    where: { expenseId: id },
    select: { fileName: true },
  });
  await Promise.all(docs.map((d) => storage.delete(d.fileName)));
  await prisma.document.deleteMany({ where: { expenseId: id } });
  await prisma.expense.deleteMany({ where: { id, projectId } });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}
