"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager, canWrite } from "@/server/access";
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
    `${project.ownerId}/${projectId}/nabidky`,
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
  await prisma.offer.delete({ where: { id: offer.id } });
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

  void user;
  revalidatePath(`/projects/${projectId}`);
}
