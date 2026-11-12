"use server";


import { UserError } from "@/lib/user-error";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole, isManager } from "@/server/access";
import { createCostReport, runCostReport } from "@/server/cost-report";

async function managerOf(projectId: string) {
  const user = await requireUser();
  if (!isManager(await getProjectRole(projectId, user))) throw new UserError("Report připravuje správce projektu.");
  return user;
}

/** Spustí report nákladů projektu / složky na pozadí (stránku otevře klient). */
export async function startCostReport(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const sub = String(formData.get("subProjectId") || "") || null;
  const user = await managerOf(projectId);
  if (sub) {
    const s = await prisma.subProject.findFirst({ where: { id: sub, projectId }, select: { id: true } });
    if (!s) throw new UserError("Složka nenalezena.");
  }
  const id = await createCostReport(projectId, sub, user.id, String(formData.get("prompt") || ""));
  after(() => runCostReport(id));
  return { id };
}

/** Přepočet se stejným upřesněním (nový snímek – starý report zůstane). */
export async function rerunCostReport(formData: FormData) {
  const r = await prisma.costReport.findUnique({
    where: { id: String(formData.get("id")) },
    select: { projectId: true, subProjectId: true, prompt: true },
  });
  if (!r) throw new UserError("Report nenalezen.");
  const user = await managerOf(r.projectId);
  const prompt = formData.has("prompt") ? String(formData.get("prompt") || "") : r.prompt;
  const id = await createCostReport(r.projectId, r.subProjectId, user.id, prompt);
  after(() => runCostReport(id));
  return { id };
}

const MAX_PDF = 14 * 1024 * 1024;

/** Uloží PDF reportu do dokumentů projektu / složky (starší PDF téhož reportu nahradí). */
export async function saveCostReportPdf(formData: FormData) {
  const id = String(formData.get("id"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserError("PDF se nepodařilo vytvořit.");
  if (file.size > MAX_PDF) throw new UserError("PDF je větší než 14 MB.");
  const r = await prisma.costReport.findUnique({
    where: { id },
    select: { id: true, projectId: true, subProjectId: true, documentId: true, project: { select: { ownerId: true } } },
  });
  if (!r) throw new UserError("Report nenalezen.");
  const user = await managerOf(r.projectId);

  const key = await storage.save(Buffer.from(await file.arrayBuffer()), file.name, `${r.project.ownerId}/${r.projectId}/other`);
  const doc = await prisma.document.create({
    data: {
      projectId: r.projectId,
      subProjectId: r.subProjectId,
      fileName: key,
      originalName: file.name,
      mimeType: "application/pdf",
      size: file.size,
      type: "other",
      summary: "Report nákladů",
      uploadedById: user.id,
    },
    select: { id: true },
  });
  if (r.documentId) {
    const old = await prisma.document.findFirst({ where: { id: r.documentId, projectId: r.projectId }, select: { id: true, fileName: true } });
    if (old) {
      await prisma.document.delete({ where: { id: old.id } });
      await storage.delete(old.fileName);
    }
  }
  await prisma.costReport.update({ where: { id: r.id }, data: { documentId: doc.id } });
  revalidatePath(`/projects/${r.projectId}`);
  revalidatePath(`/report/${r.id}`);
  return { documentId: doc.id };
}

/** Smaže report i jeho uložené PDF. */
export async function deleteCostReport(formData: FormData) {
  const r = await prisma.costReport.findUnique({
    where: { id: String(formData.get("id")) },
    select: { id: true, projectId: true, documentId: true },
  });
  if (!r) return;
  await managerOf(r.projectId);
  if (r.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: r.documentId, projectId: r.projectId }, select: { id: true, fileName: true } });
    if (doc) {
      await prisma.document.delete({ where: { id: doc.id } });
      await storage.delete(doc.fileName);
    }
  }
  await prisma.costReport.delete({ where: { id: r.id } });
  revalidatePath(`/projects/${r.projectId}/reporty`);
  revalidatePath(`/projects/${r.projectId}`);
}
