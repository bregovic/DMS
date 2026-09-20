"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { canWrite, getProjectRole } from "@/server/access";
import { createDocScan, fetchAres, runDocScan, type ScanResult } from "@/server/doc-scan";
import { notifyExpenseAdded } from "@/server/notify";
import { EXPENSE_PAID_STAGE } from "@/lib/constants";

async function writable(projectId: string) {
  const user = await requireUser();
  const role = await getProjectRole(projectId, user);
  if (!canWrite(role)) throw new Error("Nemáš oprávnění.");
  return user;
}

/** Spustí (nebo zopakuje) vytěžení dokladu z přílohy. */
export async function scanDocument(formData: FormData) {
  const documentId = String(formData.get("documentId"));
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { projectId: true } });
  if (!doc) throw new Error("Příloha nenalezena.");
  const user = await writable(doc.projectId);
  const id = await createDocScan(doc.projectId, documentId, user.id);
  after(() => runDocScan(id));
  revalidatePath(`/projects/${doc.projectId}`);
  return { id };
}

/** Návrh k potvrzení (pro dialog kontroly). */
export async function getDocScan(id: string) {
  const scan = await prisma.docScan.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      status: true,
      error: true,
      result: true,
      expenseId: true,
      document: { select: { id: true, originalName: true, type: true } },
    },
  });
  if (!scan) throw new Error("Návrh nenalezen.");
  await writable(scan.projectId);
  return { ...scan, result: (scan.result ?? null) as ScanResult | null };
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Potvrzení návrhu → vznikne výdaj s daňovými údaji a položkami.
 * Dodavatel se spáruje podle IČO (jinak podle názvu); když neexistuje a je
 * zadané IČO, založí se z ARESu.
 */
export async function applyDocScan(formData: FormData) {
  const scanId = String(formData.get("scanId"));
  const scan = await prisma.docScan.findUnique({
    where: { id: scanId },
    select: { id: true, projectId: true, documentId: true, status: true, expenseId: true },
  });
  if (!scan) throw new Error("Návrh nenalezen.");
  if (scan.expenseId) throw new Error("Z tohoto dokladu už výdaj vznikl.");
  const user = await writable(scan.projectId);
  const project = await prisma.project.findUnique({ where: { id: scan.projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");

  // dodavatel: vybraný, nebo podle IČO / názvu, případně nový z ARESu
  const ico = String(formData.get("supplierIco") || "").replace(/\D/g, "") || null;
  const dic = String(formData.get("supplierDic") || "").trim() || null;
  const supplierName = String(formData.get("supplierName") || "").trim();
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId === "__new") vendorId = null;
  const createVendor = formData.get("createVendor") === "1";
  if (!vendorId && (ico || supplierName)) {
    const found = await prisma.vendor.findFirst({
      where: {
        ownerId: project.ownerId,
        OR: [...(ico ? [{ ico }] : []), ...(supplierName ? [{ name: { equals: supplierName, mode: "insensitive" as const } }] : [])],
      },
      select: { id: true },
    });
    vendorId = found?.id ?? null;
  }
  if (!vendorId && createVendor && (ico || supplierName)) {
    const ares = ico ? await fetchAres(ico) : null;
    const v = await prisma.vendor.create({
      data: {
        ownerId: project.ownerId,
        name: (ares?.name || supplierName || ico || "Dodavatel").slice(0, 200),
        email: `${ico ?? Date.now()}@ares.local`,
        category: "other",
        ico,
        dic: dic ?? ares?.dic ?? null,
        address: ares?.address ?? null,
      },
      select: { id: true },
    });
    vendorId = v.id;
  }

  const vatRows = JSON.parse(String(formData.get("vatRows") || "[]")) as { rate: number; base: number; vat: number }[];
  const items = JSON.parse(String(formData.get("items") || "[]")) as {
    description: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    amount: number;
    vatRate: number | null;
  }[];
  const total = num(formData.get("total")) ?? 0;
  const paid = formData.get("paid") === "1";
  const subProjectId = String(formData.get("subProjectId") || "") || null;

  const expense = await prisma.expense.create({
    data: {
      projectId: scan.projectId,
      subProjectId,
      title: String(formData.get("title") || "Doklad").slice(0, 200),
      description: String(formData.get("description") || "").slice(0, 2000) || null,
      amount: total,
      currency: String(formData.get("currency") || "CZK").slice(0, 3),
      category: String(formData.get("category") || "other"),
      kind: "expense",
      status: "approved",
      stage: paid ? EXPENSE_PAID_STAGE : null,
      date: date(formData.get("date")) ?? new Date(),
      dueDate: date(formData.get("dueDate")),
      taxDate: date(formData.get("taxDate")),
      docNumber: String(formData.get("docNumber") || "").slice(0, 100) || null,
      variableSymbol: String(formData.get("variableSymbol") || "").slice(0, 50) || null,
      vatBase: num(formData.get("vatBase")),
      vatAmount: num(formData.get("vatAmount")),
      vatRate: vatRows.length === 1 ? vatRows[0].rate : null,
      vatBreakdown: vatRows.length ? vatRows : undefined,
      supplierIco: ico,
      supplierDic: dic,
      deductible: formData.get("deductible") !== "0",
      vendorId,
      createdById: user.id,
      items: {
        create: items.slice(0, 100).map((i, idx) => ({
          line: idx,
          description: String(i.description || "").slice(0, 300) || "Položka",
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          unitPrice: i.unitPrice ?? null,
          amount: i.amount ?? 0,
          vatRate: i.vatRate ?? null,
        })),
      },
    },
    select: { id: true },
  });

  await prisma.document.update({ where: { id: scan.documentId }, data: { expenseId: expense.id } });
  await prisma.docScan.update({ where: { id: scan.id }, data: { status: "applied", expenseId: expense.id } });
  await notifyExpenseAdded([expense.id], user.id);
  revalidatePath(`/projects/${scan.projectId}`);
  revalidatePath("/payments");
  return { expenseId: expense.id };
}

/** Zahodit návrh (doklad zůstane jako příloha). */
export async function dismissDocScan(formData: FormData) {
  const id = String(formData.get("id"));
  const scan = await prisma.docScan.findUnique({ where: { id }, select: { projectId: true } });
  if (!scan) return;
  await writable(scan.projectId);
  await prisma.docScan.update({ where: { id }, data: { status: "dismissed" } });
  revalidatePath(`/projects/${scan.projectId}`);
}

/** Dodavatelé projektu pro výběr v dialogu (spárování dokladu). */
export async function vendorsForScan(projectId: string) {
  const user = await writable(projectId);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  void user;
  if (!project) return [];
  return prisma.vendor.findMany({
    where: { ownerId: project.ownerId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ico: true },
  });
}
