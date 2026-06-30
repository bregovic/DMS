"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, getProjectAccess, expandScope, isManager, canWrite } from "@/server/access";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function createRequest(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  const access = await getProjectAccess(projectId, user);
  if (!access || !canWrite(access.role)) {
    throw new Error("Nemáš oprávnění přidávat do tohoto projektu.");
  }

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej, co se poptává.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

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

  if (access.scopeSubIds) {
    const scope = await expandScope(projectId, access.scopeSubIds);
    if (!subProjectId || !scope.has(subProjectId)) {
      throw new Error("Do této složky nemáš oprávnění přidávat.");
    }
  }

  const reqDateStr = String(formData.get("requiredDate") || "");
  const requiredDate = reqDateStr ? new Date(reqDateStr) : null;

  await prisma.request.create({
    data: {
      projectId,
      title,
      description: String(formData.get("description") || "").trim() || null,
      quantity: num(formData.get("quantity")),
      unit: String(formData.get("unit") || "ks"),
      category: String(formData.get("category") || "other"),
      price: num(formData.get("price")),
      vendorId,
      subProjectId,
      requiredDate:
        requiredDate && !isNaN(requiredDate.getTime()) ? requiredDate : null,
      status: "poptavka",
      createdById: user.id,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function setRequestStatus(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const status = String(formData.get("status") || "new");

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Měnit stav může jen vlastník projektu.");
  }
  await prisma.request.updateMany({ where: { id, projectId }, data: { status } });
  revalidatePath(`/projects/${projectId}`);
}

export async function createExpenseFromRequest(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Výdaj ze žádanky může založit jen vlastník projektu.");
  }
  const req = await prisma.request.findFirst({ where: { id, projectId } });
  if (!req) throw new Error("Žádanka nenalezena.");
  if (!req.vendorId || req.price == null) {
    throw new Error("Žádanka musí mít vyplněného dodavatele a cenu.");
  }

  await prisma.expense.create({
    data: {
      projectId,
      title: req.title,
      description: req.description,
      amount: req.price,
      currency: "CZK",
      category: req.category,
      kind: "expense",
      status: "approved",
      date: new Date(),
      vendorId: req.vendorId,
      subProjectId: req.subProjectId,
      createdById: user.id,
    },
  });
  await prisma.request.update({
    where: { id },
    data: { status: "schvaleno" },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export async function deleteRequest(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Mazat může jen vlastník projektu.");
  }
  await prisma.request.deleteMany({ where: { id, projectId } });
  revalidatePath(`/projects/${projectId}`);
}
