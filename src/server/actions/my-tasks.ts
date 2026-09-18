"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { canWrite, getProjectAccess } from "@/server/access";

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Vykázání práce / výdaje na přidělený úkol (#29).
 *
 * Smí to dodavatel, kterému je úkol přidělený (podle e-mailu dodavatele),
 * řešitel úkolu, nebo kdokoli, kdo do projektu smí zapisovat. Dodavatel
 * přitom k projektu přístup mít nemusí - vidí jen své úkoly na stránce
 * Moje úkoly a vykazuje na ně, nic víc z projektu.
 *
 * Výdaj se naváže na úkol (a jeho složku), takže vlastník ho uvidí
 * v projektu u úkolu a sníží se o něj forecast.
 */
export async function logTaskExpense(formData: FormData) {
  const user = await requireUser();
  const email = user.email?.toLowerCase() ?? "";
  const taskId = String(formData.get("taskId") || "");

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      projectId: true,
      subProjectId: true,
      assigneeEmail: true,
      vendorId: true,
      vendor: { select: { email: true } },
      project: { select: { ownerId: true, defaultCategory: true, defaultCurrency: true } },
    },
  });
  if (!task) throw new Error("Úkol nenalezen.");

  const isVendor = !!email && task.vendor?.email?.toLowerCase() === email;
  const isAssignee = !!email && task.assigneeEmail?.toLowerCase() === email;
  if (!isVendor && !isAssignee) {
    const access = await getProjectAccess(task.projectId, user);
    if (!access || !canWrite(access.role)) {
      throw new Error("Na tento úkol nemůžeš vykazovat.");
    }
  }

  const hours = num(formData.get("hours"));
  const rate = num(formData.get("rate"));
  let amount: number | null;
  if (hours && hours > 0) {
    if (!rate || rate <= 0) throw new Error("Zadej hodinovou sazbu.");
    amount = Math.round(hours * rate * 100) / 100;
  } else {
    amount = num(formData.get("amount"));
    if (!amount || amount <= 0) throw new Error("Zadej hodiny se sazbou, nebo částku.");
  }

  // Dodavatel výdaje: ten z úkolu, když jsem to já; jinak můj záznam
  // v evidenci vlastníka projektu (stejný e-mail), pokud existuje.
  let vendorId: string | null = isVendor ? task.vendorId : null;
  if (!vendorId && email) {
    const mine = await prisma.vendor.findFirst({
      where: { ownerId: task.project.ownerId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    vendorId = mine?.id ?? null;
  }

  const dateStr = String(formData.get("date") || "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("description") || "").trim();

  await prisma.expense.create({
    data: {
      projectId: task.projectId,
      subProjectId: task.subProjectId,
      taskId: task.id,
      title: task.title,
      description: note || null,
      kind: hours && hours > 0 ? "work" : "expense",
      category: task.project.defaultCategory ?? "other",
      currency: task.project.defaultCurrency ?? "CZK",
      amount,
      hours: hours && hours > 0 ? hours : null,
      rate: hours && hours > 0 ? rate : null,
      date: isNaN(date.getTime()) ? new Date() : date,
      vendorId,
      status: "approved",
      createdById: user.id,
    },
  });

  // Sazbu si dodavatel příště nemusí psát znovu.
  if (vendorId && hours && hours > 0 && rate) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { hourlyRate: rate } }).catch(() => {});
  }

  revalidatePath("/ukoly");
  revalidatePath(`/projects/${task.projectId}`);
}
