"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { getProjectRole, isManager } from "@/server/access";
import { deleteWithFiles, requestFolder } from "@/server/document-files";
import { newToken, offerFieldsFromText } from "@/server/tenders";

/**
 * Správa poptávkových řízení (#49). Řízení zakládá a spravuje jen vlastník
 * projektu nebo spolusprávce.
 */

async function managerOf(projectId: string) {
  const user = await requireUser();
  const role = await getProjectRole(projectId, user);
  if (!isManager(role)) throw new Error("Poptávková řízení spravuje vlastník projektu.");
  return user;
}

async function tenderCtx(tenderId: string) {
  const t = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: { id: true, projectId: true, project: { select: { ownerId: true } } },
  });
  if (!t) throw new Error("Řízení nenalezeno.");
  const user = await managerOf(t.projectId);
  return { user, tender: t };
}

const path = (projectId: string, tenderId?: string) =>
  `/projects/${projectId}/rizeni${tenderId ? `/${tenderId}` : ""}`;

function str(v: FormDataEntryValue | null, max = 2000) {
  return String(v ?? "").trim().slice(0, max) || null;
}

function dateOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Nové řízení z vybraných žádanek. */
export async function createTender(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await managerOf(projectId);
  const ids = formData.getAll("requestId").map(String).filter(Boolean);
  const requests = await prisma.request.findMany({
    where: { id: { in: ids }, projectId },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, subProjectId: true },
  });
  if (!requests.length) throw new Error("Vyber aspoň jednu žádanku.");
  const subProjectId = String(formData.get("subProjectId") || "") || null;
  const title =
    str(formData.get("title"), 200) ??
    (requests.length === 1 ? requests[0].title : requests.map((r) => r.title).join(", ").slice(0, 200));

  const owner = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });
  const t = await prisma.tender.create({
    data: {
      projectId,
      subProjectId,
      token: newToken(),
      title,
      contact: [owner?.name, owner?.email].filter(Boolean).join(", ") || null,
      createdById: user.id,
      requests: { create: requests.map((r, i) => ({ requestId: r.id, sortOrder: i })) },
    },
    select: { id: true },
  });
  revalidatePath(`/projects/${projectId}`);
  redirect(path(projectId, t.id));
}

export async function updateTender(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  try {
    const { tender } = await tenderCtx(String(formData.get("id")));
    const title = str(formData.get("title"), 200);
    if (!title) return { error: "Vyplň název řízení." };
    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        title,
        intro: str(formData.get("intro"), 4000),
        location: str(formData.get("location"), 200),
        contact: str(formData.get("contact"), 300),
        deadline: dateOrNull(formData.get("deadline")),
      },
    });
    revalidatePath(path(tender.projectId, tender.id));
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Uložení se nepovedlo." };
  }
}

export async function setTenderStatus(formData: FormData) {
  const { tender } = await tenderCtx(String(formData.get("id")));
  const status = String(formData.get("status"));
  if (!["draft", "open", "closed"].includes(status)) throw new Error("Neplatný stav.");
  await prisma.tender.update({ where: { id: tender.id }, data: { status } });
  revalidatePath(path(tender.projectId, tender.id));
  revalidatePath(path(tender.projectId));
}

export async function deleteTender(formData: FormData) {
  const { tender } = await tenderCtx(String(formData.get("id")));
  // Podané nabídky zůstávají u žádanek, zmizí jen řízení a pozvánky.
  await prisma.tender.delete({ where: { id: tender.id } });
  revalidatePath(`/projects/${tender.projectId}`);
  redirect(path(tender.projectId));
}

/** Které žádanky řízení obsahuje (zaškrtávací seznam). */
export async function setTenderRequests(formData: FormData) {
  const { tender } = await tenderCtx(String(formData.get("id")));
  const ids = formData.getAll("requestId").map(String).filter(Boolean);
  const valid = await prisma.request.findMany({
    where: { id: { in: ids }, projectId: tender.projectId },
    select: { id: true },
  });
  const keep = ids.filter((id) => valid.some((v) => v.id === id));
  if (!keep.length) throw new Error("Řízení musí mít aspoň jednu žádanku.");
  await prisma.$transaction([
    prisma.tenderRequest.deleteMany({ where: { tenderId: tender.id, requestId: { notIn: keep } } }),
    ...keep.map((requestId, i) =>
      prisma.tenderRequest.upsert({
        where: { tenderId_requestId: { tenderId: tender.id, requestId } },
        update: { sortOrder: i },
        create: { tenderId: tender.id, requestId, sortOrder: i },
      }),
    ),
  ]);
  revalidatePath(path(tender.projectId, tender.id));
}

/** Zadání žádanky pro dodavatele: specifikace a údaje k vyplnění. */
export async function updateRequestBrief(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  try {
    const requestId = String(formData.get("requestId"));
    const r = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, projectId: true } });
    if (!r) return { error: "Žádanka nenalezena." };
    await managerOf(r.projectId);
    const q = String(formData.get("quantity") ?? "").replace(",", ".").trim();
    const quantity = q === "" ? null : Number(q);
    await prisma.request.update({
      where: { id: r.id },
      data: {
        description: str(formData.get("description"), 8000),
        offerFields: offerFieldsFromText(String(formData.get("offerFields") ?? "")),
        ...(quantity == null || !isNaN(quantity) ? { quantity } : {}),
        unit: str(formData.get("unit"), 20) ?? "ks",
        requiredDate: dateOrNull(formData.get("requiredDate")),
      },
    });
    const tenderId = String(formData.get("tenderId") || "");
    revalidatePath(tenderId ? path(r.projectId, tenderId) : `/projects/${r.projectId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Uložení se nepovedlo." };
  }
}

/** Fotky do galerie žádanky – uvidí je dodavatelé na portálu. */
export async function addGalleryPhotos(formData: FormData) {
  const requestId = String(formData.get("requestId"));
  const r = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, projectId: true, subProjectId: true, project: { select: { ownerId: true } } },
  });
  if (!r) throw new Error("Žádanka nenalezena.");
  const user = await managerOf(r.projectId);
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Vyber fotky.");
  for (const file of files.slice(0, 20)) {
    if (!/^image\//.test(file.type)) continue;
    if (file.size > 14 * 1024 * 1024) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    const key = await storage.save(buf, file.name, `${requestFolder(r.project.ownerId, r.projectId, r.id)}/galerie`);
    await prisma.document.create({
      data: {
        projectId: r.projectId,
        subProjectId: r.subProjectId,
        requestId: r.id,
        gallery: true,
        fileName: key,
        originalName: file.name,
        mimeType: file.type,
        size: buf.length,
        type: "other",
        uploadedById: user.id,
      },
    });
  }
  const tenderId = String(formData.get("tenderId") || "");
  revalidatePath(tenderId ? path(r.projectId, tenderId) : `/projects/${r.projectId}`);
}

export async function removeGalleryPhoto(formData: FormData) {
  const id = String(formData.get("id"));
  const d = await prisma.document.findUnique({ where: { id }, select: { id: true, projectId: true, gallery: true } });
  if (!d || !d.gallery) throw new Error("Fotka nenalezena.");
  await managerOf(d.projectId);
  await deleteWithFiles({ id: d.id }, () => prisma.document.delete({ where: { id: d.id } }));
  const tenderId = String(formData.get("tenderId") || "");
  revalidatePath(tenderId ? path(d.projectId, tenderId) : `/projects/${d.projectId}`);
}

// ---------------------------------------------------------------------------
// Pozvánky
// ---------------------------------------------------------------------------

export async function addInvites(formData: FormData) {
  const { tender } = await tenderCtx(String(formData.get("id")));
  const vendorIds = formData.getAll("vendorId").map(String).filter(Boolean);
  const name = str(formData.get("name"), 200);
  const email = str(formData.get("email"), 200)?.toLowerCase() ?? null;

  const existing = await prisma.tenderInvite.findMany({
    where: { tenderId: tender.id },
    select: { vendorId: true, email: true },
  });
  if (vendorIds.length) {
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: vendorIds }, ownerId: tender.project.ownerId },
      select: { id: true, name: true, email: true },
    });
    for (const v of vendors) {
      if (existing.some((e) => e.vendorId === v.id)) continue;
      await prisma.tenderInvite.create({
        data: { tenderId: tender.id, vendorId: v.id, name: v.name, email: v.email, token: newToken() },
      });
    }
  }
  if (name || email) {
    if (!email || !existing.some((e) => e.email === email)) {
      // Kontakt mimo evidenci: přiřadí se k dodavateli se stejným e-mailem, pokud je.
      const v = email
        ? await prisma.vendor.findFirst({
            where: { ownerId: tender.project.ownerId, email: { equals: email, mode: "insensitive" } },
            select: { id: true, name: true },
          })
        : null;
      await prisma.tenderInvite.create({
        data: {
          tenderId: tender.id,
          vendorId: v?.id ?? null,
          name: name ?? v?.name ?? email ?? "Dodavatel",
          email,
          token: newToken(),
        },
      });
    }
  }
  revalidatePath(path(tender.projectId, tender.id));
}

export async function toggleInviteSent(formData: FormData) {
  const inv = await prisma.tenderInvite.findUnique({
    where: { id: String(formData.get("id")) },
    select: { id: true, tenderId: true, sentAt: true },
  });
  if (!inv) throw new Error("Pozvánka nenalezena.");
  const { tender } = await tenderCtx(inv.tenderId);
  const sent = String(formData.get("sent") ?? "") !== "0";
  await prisma.tenderInvite.update({ where: { id: inv.id }, data: { sentAt: sent ? (inv.sentAt ?? new Date()) : null } });
  revalidatePath(path(tender.projectId, tender.id));
}

/** Všem dosud neodeslaným pozvánkám zapíše odeslání (jeden e-mail všem). */
export async function markInvitesSent(formData: FormData) {
  const { tender } = await tenderCtx(String(formData.get("id")));
  await prisma.tenderInvite.updateMany({ where: { tenderId: tender.id, sentAt: null }, data: { sentAt: new Date() } });
  revalidatePath(path(tender.projectId, tender.id));
}

export async function deleteInvite(formData: FormData) {
  const inv = await prisma.tenderInvite.findUnique({
    where: { id: String(formData.get("id")) },
    select: { id: true, tenderId: true },
  });
  if (!inv) return;
  const { tender } = await tenderCtx(inv.tenderId);
  await prisma.tenderInvite.delete({ where: { id: inv.id } });
  revalidatePath(path(tender.projectId, tender.id));
}

// ---------------------------------------------------------------------------
// Odpověď dodavateli
// ---------------------------------------------------------------------------

export async function saveSubmissionReply(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  try {
    const s = await prisma.tenderSubmission.findUnique({
      where: { id: String(formData.get("id")) },
      select: { id: true, tenderId: true },
    });
    if (!s) return { error: "Nabídka nenalezena." };
    const { tender } = await tenderCtx(s.tenderId);
    const reply = str(formData.get("reply"), 4000);
    const publish = String(formData.get("publish") ?? "") === "1";
    const unpublish = String(formData.get("publish") ?? "") === "0";
    if (publish && !reply) return { error: "Napiš text odpovědi." };
    await prisma.tenderSubmission.update({
      where: { id: s.id },
      data: {
        reply,
        ...(publish ? { replyPublishedAt: new Date() } : {}),
        ...(unpublish ? { replyPublishedAt: null } : {}),
      },
    });
    revalidatePath(path(tender.projectId, tender.id));
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Uložení se nepovedlo." };
  }
}
