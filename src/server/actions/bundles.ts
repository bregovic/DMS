"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager, canWrite } from "@/server/access";
import { deleteWithFiles, bundleFolder } from "@/server/document-files";
import { storage } from "@/lib/storage";

/**
 * Poptávkové balíčky (#40) – sdružení žádanek a společná nabídka na celek.
 * Cena společné nabídky je celková; rozpad po žádankách je volitelný, části
 * bez ceny znamenají „firma tuhle žádanku kryje, ale cenu nerozepsala“.
 */

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  return String(v || "").trim() || null;
}
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const s = String(v || "");
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function projectCtx(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");
  const role = await getProjectRole(projectId, user);
  return { user, project, role };
}

async function bundleCtx(bundleId: string) {
  const user = await requireUser();
  const bundle = await prisma.requestBundle.findUnique({
    where: { id: bundleId },
    select: { id: true, projectId: true, name: true, project: { select: { ownerId: true } } },
  });
  if (!bundle) throw new Error("Balíček nenalezen.");
  const role = await getProjectRole(bundle.projectId, user);
  return { user, bundle, role, ownerId: bundle.project.ownerId };
}

// ---------------------------------------------------------------------------
// Balíček
// ---------------------------------------------------------------------------

/** Sdružit vybrané žádanky do nového balíčku (nebo do existujícího). */
export async function createBundle(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const { user, role } = await projectCtx(projectId);
  if (!isManager(role)) throw new Error("Balíček zakládá správce projektu.");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Zadej název balíčku.");
  const ids = formData.getAll("requestIds").map(String).filter(Boolean);

  const bundle = await prisma.requestBundle.create({
    data: { projectId, name, note: strOrNull(formData.get("note")), createdById: user.id },
    select: { id: true },
  });
  if (ids.length)
    await prisma.request.updateMany({ where: { id: { in: ids }, projectId }, data: { bundleId: bundle.id } });
  revalidatePath(`/projects/${projectId}`);
  return { id: bundle.id };
}

export async function updateBundle(formData: FormData) {
  const { bundle, role } = await bundleCtx(String(formData.get("id")));
  if (!isManager(role)) throw new Error("Nemáš oprávnění.");
  const name = String(formData.get("name") || "").trim();
  await prisma.requestBundle.update({
    where: { id: bundle.id },
    data: {
      ...(name ? { name } : {}),
      note: strOrNull(formData.get("note")),
      ...(formData.has("status") ? { status: String(formData.get("status")) } : {}),
    },
  });
  revalidatePath(`/projects/${bundle.projectId}`);
}

/** Rozpustit balíček – žádanky zůstanou, jen se odpojí (nabídky zaniknou). */
export async function deleteBundle(formData: FormData) {
  const { bundle, role } = await bundleCtx(String(formData.get("id")));
  if (!isManager(role)) throw new Error("Nemáš oprávnění.");
  // Kaskádou padnou společné nabídky i jejich části – smazat i jejich soubory.
  await deleteWithFiles(
    { OR: [{ bundleOffer: { bundleId: bundle.id } }, { offer: { bundleOffer: { bundleId: bundle.id } } }] },
    () => prisma.requestBundle.delete({ where: { id: bundle.id } }),
  );
  revalidatePath(`/projects/${bundle.projectId}`);
}

/** Zařadit žádanky do balíčku (prázdný balíček = vyřadit). Hromadná akce. */
export async function setRequestsBundle(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const { role } = await projectCtx(projectId);
  if (!isManager(role)) throw new Error("Nemáš oprávnění.");
  const ids = formData.getAll("requestIds").map(String).filter(Boolean);
  if (!ids.length) throw new Error("Nevybral jsi žádnou žádanku.");
  const bundleId = String(formData.get("bundleId") || "") || null;
  if (bundleId) {
    const b = await prisma.requestBundle.findFirst({ where: { id: bundleId, projectId }, select: { id: true } });
    if (!b) throw new Error("Balíček nenalezen.");
  }
  await prisma.request.updateMany({ where: { id: { in: ids }, projectId }, data: { bundleId } });
  revalidatePath(`/projects/${projectId}`);
  return { moved: ids.length };
}

// ---------------------------------------------------------------------------
// Společná nabídka
// ---------------------------------------------------------------------------

/** Dodavatel z evidence účtu, nebo volný název. */
async function readVendor(formData: FormData, ownerId: string) {
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({ where: { id: vendorId, ownerId }, select: { id: true } });
    if (!v) vendorId = null;
  }
  return { vendorId, vendorName: vendorId ? null : strOrNull(formData.get("vendorName")) };
}

/**
 * Části nabídky po žádankách podle formuláře: `cover_<requestId>` = kryje,
 * `part_<requestId>` = cena té části (nepovinná).
 */
function readParts(formData: FormData, requestIds: string[]) {
  return requestIds
    .filter((id) => formData.get(`cover_${id}`) === "1")
    .map((id) => ({ requestId: id, price: num(formData.get(`part_${id}`)) }));
}

/** Přepíše části společné nabídky (Offer s bundleOfferId) podle formuláře. */
async function syncParts(
  bundleOfferId: string,
  parts: { requestId: string; price: number | null }[],
  base: { vendorId: string | null; vendorName: string | null; status: string; createdById: string },
) {
  const existing = await prisma.offer.findMany({
    where: { bundleOfferId },
    select: { id: true, requestId: true },
  });
  const keep = new Set(parts.map((p) => p.requestId));
  const gone = existing.filter((o) => !keep.has(o.requestId)).map((o) => o.id);
  if (gone.length)
    await deleteWithFiles({ offerId: { in: gone } }, () => prisma.offer.deleteMany({ where: { id: { in: gone } } }));
  for (const p of parts) {
    const cur = existing.find((o) => o.requestId === p.requestId);
    if (cur) await prisma.offer.update({ where: { id: cur.id }, data: { price: p.price, ...base } });
    else
      await prisma.offer.create({
        data: { requestId: p.requestId, bundleOfferId, price: p.price, ...base },
      });
  }
}

export async function createBundleOffer(formData: FormData) {
  const { user, bundle, role, ownerId } = await bundleCtx(String(formData.get("bundleId")));
  if (!canWrite(role)) throw new Error("Nemáš oprávnění přidávat nabídky.");
  const { vendorId, vendorName } = await readVendor(formData, ownerId);

  const reqs = await prisma.request.findMany({ where: { bundleId: bundle.id }, select: { id: true } });
  const parts = readParts(formData, reqs.map((r) => r.id));
  if (parts.length === 0) throw new Error("Označ, kterých žádanek se nabídka týká.");

  const offer = await prisma.bundleOffer.create({
    data: {
      bundleId: bundle.id,
      vendorId,
      vendorName,
      price: num(formData.get("price")),
      priceWithoutVat: num(formData.get("priceWithoutVat")),
      deliveryDate: dateOrNull(formData.get("deliveryDate")),
      note: strOrNull(formData.get("note")),
      createdById: user.id,
    },
    select: { id: true, status: true },
  });
  await syncParts(offer.id, parts, { vendorId, vendorName, status: offer.status, createdById: user.id });
  revalidatePath(`/projects/${bundle.projectId}`);
  return { id: offer.id };
}

async function bundleOfferCtx(id: string) {
  const user = await requireUser();
  const offer = await prisma.bundleOffer.findUnique({
    where: { id },
    select: {
      id: true,
      bundleId: true,
      status: true,
      createdById: true,
      bundle: { select: { id: true, projectId: true, project: { select: { ownerId: true } } } },
    },
  });
  if (!offer) throw new Error("Nabídka nenalezena.");
  const role = await getProjectRole(offer.bundle.projectId, user);
  const canEdit = isManager(role) || (canWrite(role) && offer.createdById === user.id);
  return { user, offer, role, canEdit, projectId: offer.bundle.projectId, ownerId: offer.bundle.project.ownerId };
}

export async function updateBundleOffer(formData: FormData) {
  const { user, offer, canEdit, projectId, ownerId } = await bundleOfferCtx(String(formData.get("id")));
  if (!canEdit) throw new Error("Tuhle nabídku nemůžeš upravit.");
  const { vendorId, vendorName } = await readVendor(formData, ownerId);
  const reqs = await prisma.request.findMany({ where: { bundleId: offer.bundleId }, select: { id: true } });
  const parts = readParts(formData, reqs.map((r) => r.id));
  if (parts.length === 0) throw new Error("Označ, kterých žádanek se nabídka týká.");

  await prisma.bundleOffer.update({
    where: { id: offer.id },
    data: {
      vendorId,
      vendorName,
      price: num(formData.get("price")),
      priceWithoutVat: num(formData.get("priceWithoutVat")),
      deliveryDate: dateOrNull(formData.get("deliveryDate")),
      note: strOrNull(formData.get("note")),
    },
  });
  await syncParts(offer.id, parts, { vendorId, vendorName, status: offer.status, createdById: user.id });
  revalidatePath(`/projects/${projectId}`);
}

export async function setBundleOfferStatus(formData: FormData) {
  const { offer, canEdit, projectId } = await bundleOfferCtx(String(formData.get("id")));
  if (!canEdit) throw new Error("Stav nabídky nemůžeš měnit.");
  const status = String(formData.get("status") || "nova");
  await prisma.$transaction([
    prisma.bundleOffer.update({ where: { id: offer.id }, data: { status } }),
    prisma.offer.updateMany({ where: { bundleOfferId: offer.id }, data: { status } }),
  ]);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteBundleOffer(formData: FormData) {
  const { offer, canEdit, projectId } = await bundleOfferCtx(String(formData.get("id")));
  if (!canEdit) throw new Error("Tuhle nabídku nemůžeš smazat.");
  await deleteWithFiles(
    { OR: [{ bundleOfferId: offer.id }, { offer: { bundleOfferId: offer.id } }] },
    () => prisma.bundleOffer.delete({ where: { id: offer.id } }),
  );
  revalidatePath(`/projects/${projectId}`);
}

export async function attachBundleOfferFile(formData: FormData) {
  const { user, offer, canEdit, projectId, ownerId } = await bundleOfferCtx(String(formData.get("id")));
  if (!canEdit) throw new Error("K této nabídce nemůžeš přidat přílohu.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Vyber soubor.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Soubor je větší než 8 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await storage.save(buffer, file.name, `${bundleFolder(ownerId, projectId, offer.bundleId)}/nabidky`);
  await prisma.document.create({
    data: {
      projectId,
      bundleOfferId: offer.id,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: "offer",
      uploadedById: user.id,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Rozpad celkové ceny do žádanek, které nabídka kryje, ale nerozepsala.
 * Poměrem podle očekávané ceny žádanky, a kde chybí, rovným dílem –
 * jen aby seděl forecast; uživatel může částky přepsat.
 */
function splitLump(
  lump: number,
  parts: { requestId: string; price: number | null }[],
  expected: Map<string, number | null>,
) {
  const unpriced = parts.filter((p) => p.price == null);
  if (unpriced.length === 0) return parts;
  const known = parts.reduce((a, p) => a + (p.price ?? 0), 0);
  const rest = Math.max(0, lump - known);
  const weights = unpriced.map((p) => expected.get(p.requestId) ?? 0);
  const sum = weights.reduce((a, w) => a + w, 0);
  return parts.map((p) => {
    if (p.price != null) return p;
    const i = unpriced.findIndex((u) => u.requestId === p.requestId);
    const share = sum > 0 ? weights[i] / sum : 1 / unpriced.length;
    return { ...p, price: Math.round(rest * share * 100) / 100 };
  });
}

/**
 * Vybrat vítěznou společnou nabídku: označí ji, u každé kryté žádanky
 * odznačí konkurenci, předvyplní dodavatele a cenu a nastaví stav Vyhovuje.
 * Když firma poslala jen celkovou cenu, rozpočítá ji mezi kryté žádanky.
 */
export async function selectBundleOffer(formData: FormData) {
  const { offer, role, projectId } = await bundleOfferCtx(String(formData.get("id")));
  if (!isManager(role)) throw new Error("Vybrat nabídku může jen vlastník nebo spolusprávce.");

  const full = await prisma.bundleOffer.findUnique({
    where: { id: offer.id },
    select: {
      id: true,
      bundleId: true,
      vendorId: true,
      price: true,
      selected: true,
      offers: { select: { id: true, requestId: true, price: true } },
    },
  });
  if (!full) throw new Error("Nabídka nenalezena.");

  if (full.selected) {
    await prisma.$transaction([
      prisma.bundleOffer.update({ where: { id: full.id }, data: { selected: false, status: "nova" } }),
      prisma.offer.updateMany({ where: { bundleOfferId: full.id }, data: { selected: false, status: "nova" } }),
      prisma.requestBundle.update({ where: { id: full.bundleId }, data: { status: "otevreno" } }),
    ]);
    revalidatePath(`/projects/${projectId}`);
    return;
  }

  const reqs = await prisma.request.findMany({
    where: { id: { in: full.offers.map((o) => o.requestId) } },
    select: { id: true, price: true },
  });
  const expected = new Map(reqs.map((r) => [r.id, r.price != null ? Number(r.price) : null]));
  const parts = full.offers.map((o) => ({ requestId: o.requestId, price: o.price != null ? Number(o.price) : null }));
  const priced = full.price != null ? splitLump(Number(full.price), parts, expected) : parts;
  const priceOf = new Map(priced.map((p) => [p.requestId, p.price]));

  await prisma.$transaction(async (tx) => {
    // Konkurenční nabídky u krytých žádanek odznačit, ostatní společné taky.
    await tx.bundleOffer.updateMany({ where: { bundleId: full.bundleId }, data: { selected: false } });
    await tx.offer.updateMany({
      where: { requestId: { in: full.offers.map((o) => o.requestId) } },
      data: { selected: false },
    });
    await tx.bundleOffer.update({ where: { id: full.id }, data: { selected: true, status: "vybrana" } });
    await tx.requestBundle.update({ where: { id: full.bundleId }, data: { status: "vybrano" } });
    for (const part of full.offers) {
      const price = priceOf.get(part.requestId) ?? null;
      await tx.offer.update({
        where: { id: part.id },
        data: { selected: true, status: "vybrana", ...(part.price == null && price != null ? { price } : {}) },
      });
      await tx.request.update({
        where: { id: part.requestId },
        data: {
          status: "vyhovuje",
          ...(full.vendorId ? { vendorId: full.vendorId } : {}),
          ...(price != null ? { price } : {}),
        },
      });
    }
  });
  revalidatePath(`/projects/${projectId}`);
}
