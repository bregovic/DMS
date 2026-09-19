"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { notifyTaskAssigned } from "@/server/notify";
import { getProjectRole, isManager, canWrite } from "@/server/access";
import { deleteWithFiles, requestFolder } from "@/server/document-files";
import { storage } from "@/lib/storage";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
function intOrNull(v: FormDataEntryValue | null): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  return String(v || "").trim() || null;
}

type Ctx = {
  userId: string;
  projectId: string;
  ownerId: string;
  role: string | null;
};

// Načte žádanku, projekt a roli uživatele; ověří přístup k projektu.
async function requestCtx(requestId: string): Promise<{
  request: { id: string; projectId: string };
  ctx: Ctx;
}> {
  const user = await requireUser();
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, projectId: true, project: { select: { ownerId: true } } },
  });
  if (!request) throw new Error("Žádanka nenalezena.");
  const role = await getProjectRole(request.projectId, user);
  return {
    request: { id: request.id, projectId: request.projectId },
    ctx: { userId: user.id, projectId: request.projectId, ownerId: request.project.ownerId, role },
  };
}

function readVendorName(formData: FormData): string | null {
  const n = String(formData.get("vendorName") || "").trim();
  return n || null;
}

export async function createOffer(formData: FormData) {
  const requestId = String(formData.get("requestId"));
  const { request, ctx } = await requestCtx(requestId);
  if (!canWrite(ctx.role)) {
    throw new Error("Nemáš oprávnění přidávat nabídky.");
  }

  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: ctx.ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }

  const dateStr = String(formData.get("deliveryDate") || "");
  const deliveryDate = dateStr ? new Date(dateStr) : null;

  await prisma.offer.create({
    data: {
      requestId,
      vendorId,
      vendorName: vendorId ? null : readVendorName(formData),
      price: num(formData.get("price")),
      deliveryDate:
        deliveryDate && !isNaN(deliveryDate.getTime()) ? deliveryDate : null,
      note: strOrNull(formData.get("note")),
      rating: strOrNull(formData.get("rating")),
      score: intOrNull(formData.get("score")),
      status: "nova",
      createdById: ctx.userId,
    },
  });

  revalidatePath(`/projects/${request.projectId}`);
}

// Vlastník může vše; aktivní dodavatel jen svou nabídku.
async function offerCtx(offerId: string) {
  const user = await requireUser();
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      createdById: true,
      requestId: true,
      request: { select: { projectId: true, project: { select: { ownerId: true } } } },
    },
  });
  if (!offer) throw new Error("Nabídka nenalezena.");
  const projectId = offer.request.projectId;
  const role = await getProjectRole(projectId, user);
  const canEdit = isManager(role) || (role === "active" && offer.createdById === user.id);
  return { user, offer, projectId, role, canEdit };
}

export async function updateOffer(formData: FormData) {
  const id = String(formData.get("id"));
  const { offer, projectId, canEdit } = await offerCtx(id);
  if (!canEdit) throw new Error("Tuto nabídku nemůžeš upravit.");

  const ownerId = (
    await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } })
  )?.ownerId;

  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId && ownerId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }

  const dateStr = String(formData.get("deliveryDate") || "");
  const deliveryDate = dateStr ? new Date(dateStr) : null;

  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      vendorId,
      vendorName: vendorId ? null : readVendorName(formData),
      price: num(formData.get("price")),
      deliveryDate:
        deliveryDate && !isNaN(deliveryDate.getTime()) ? deliveryDate : null,
      note: strOrNull(formData.get("note")),
      rating: strOrNull(formData.get("rating")),
      score: intOrNull(formData.get("score")),
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

// Příloha k nabídce (PDF/sken nabídky). Owner + aktivní dodavatel (svou nabídku).
export async function attachOfferFile(formData: FormData) {
  const id = String(formData.get("id"));
  const { offer, projectId, canEdit } = await offerCtx(id);
  if (!canEdit) throw new Error("K této nabídce nemůžeš přidat přílohu.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Vyber soubor.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Soubor je větší než 8 MB.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await storage.save(
    buffer,
    file.name,
    `${requestFolder(project.ownerId, projectId, offer.requestId)}/nabidky`,
  );
  await prisma.document.create({
    data: {
      projectId,
      offerId: offer.id,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: "offer",
      uploadedById: (await requireUser()).id,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function setOfferStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status") || "nova");
  const { offer, projectId, canEdit } = await offerCtx(id);
  if (!canEdit) throw new Error("Stav nabídky nemůžeš měnit.");
  await prisma.offer.update({ where: { id: offer.id }, data: { status } });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteOffer(formData: FormData) {
  const id = String(formData.get("id"));
  const { offer, projectId, canEdit } = await offerCtx(id);
  if (!canEdit) throw new Error("Tuto nabídku nemůžeš smazat.");
  await deleteWithFiles({ offerId: offer.id }, () =>
    prisma.offer.delete({ where: { id: offer.id } }),
  );
  revalidatePath(`/projects/${projectId}`);
}

// Vybere vítěznou nabídku: označí ji, ostatní odznačí a předvyplní žádanku
// (dodavatel + cena, stav → Vyhovuje). Jen vlastník projektu.
export async function selectOffer(formData: FormData) {
  const id = String(formData.get("id"));
  const { user, offer, projectId, role } = await offerCtx(id);
  if (!isManager(role)) throw new Error("Vybrat nabídku může jen vlastník nebo spolusprávce.");

  const full = await prisma.offer.findUnique({
    where: { id: offer.id },
    select: { id: true, requestId: true, vendorId: true, price: true, selected: true },
  });
  if (!full) throw new Error("Nabídka nenalezena.");

  if (full.selected) {
    // Zrušení výběru
    await prisma.offer.update({
      where: { id: full.id },
      data: { selected: false, status: "nova" },
    });
    revalidatePath(`/projects/${projectId}`);
    return;
  }

  await prisma.$transaction([
    prisma.offer.updateMany({
      where: { requestId: full.requestId },
      data: { selected: false },
    }),
    prisma.offer.update({
      where: { id: full.id },
      data: { selected: true, status: "vybrana" },
    }),
    prisma.request.update({
      where: { id: full.requestId },
      data: {
        status: "vyhovuje",
        ...(full.vendorId ? { vendorId: full.vendorId } : {}),
        ...(full.price != null ? { price: full.price } : {}),
      },
    }),
  ]);

  const created = await createPlanTasksFromOffer(full.id, user.id);
  revalidatePath(`/projects/${projectId}`);
  if (created > 0) revalidatePath("/planning");
}

/**
 * Úkoly do plánu z vybrané nabídky (#33): AI je navrhla při vytěžení
 * (objednat → zaměření → výroba/dodání → montáž). Založí se jednou, pod fázi,
 * ke které patří žádanka, s dodavatelem nabídky a návaznostmi za sebou.
 * Termíny běží od dneška; přesné zařazení udělá „Přepočítat termíny“.
 */
async function createPlanTasksFromOffer(offerId: string, userId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      vendorId: true,
      vendorName: true,
      planTasks: true,
      tasksCreatedAt: true,
      vendor: { select: { name: true } },
      request: { select: { projectId: true, subProjectId: true, taskId: true, title: true } },
    },
  });
  const drafts = (offer?.planTasks as { title: string; days: number; kind: string }[] | null) ?? [];
  if (!offer || offer.tasksCreatedAt || drafts.length === 0) return 0;

  // Fáze žádanky: navázaná fáze, nebo fáze navázaného úkolu.
  let parentId: string | null = null;
  let subProjectId = offer.request.subProjectId;
  if (offer.request.taskId) {
    const t = await prisma.task.findUnique({
      where: { id: offer.request.taskId },
      select: { id: true, kind: true, parentId: true, subProjectId: true },
    });
    if (t) {
      parentId = t.kind === "phase" ? t.id : t.parentId;
      subProjectId = t.subProjectId;
    }
  }

  const DAY = 86400000;
  const now = new Date();
  let cursor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const who = offer.vendor?.name ?? offer.vendorName ?? "dodavatel";
  const ids: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const d of drafts) {
      const days = Math.max(1, Math.round(Number(d.days) || 1));
      const start = new Date(cursor);
      const due = new Date(cursor + (days - 1) * DAY);
      cursor += days * DAY;
      const t = await tx.task.create({
        data: {
          projectId: offer.request.projectId,
          subProjectId,
          parentId,
          kind: "task",
          title: d.title.slice(0, 200),
          description: `Z vybrané nabídky (${who}) k žádance „${offer.request.title}“.`,
          status: "todo",
          startDate: start,
          dueDate: due,
          estimateDays: days,
          vendorId: offer.vendorId,
          createdById: userId,
        },
        select: { id: true },
      });
      if (ids.length) await tx.taskDependency.create({ data: { taskId: t.id, dependsOnId: ids[ids.length - 1] } });
      ids.push(t.id);
    }
    await tx.offer.update({ where: { id: offer.id }, data: { tasksCreatedAt: new Date() } });
  }, { timeout: 60_000, maxWait: 10_000 }); // hodně zápisů – výchozí 5 s nestačí
  await notifyTaskAssigned(ids, userId);
  return ids.length;
}
