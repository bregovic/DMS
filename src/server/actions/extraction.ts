"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager, canWrite } from "@/server/access";
import { createExtraction, runExtraction, type ExtractionResult } from "@/server/extraction";

async function docCtx(documentId: string) {
  const user = await requireUser();
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, projectId: true, requestId: true, uploadedById: true },
  });
  if (!doc?.requestId) throw new Error("Příloha nenalezena.");
  const role = await getProjectRole(doc.projectId, user);
  if (!(isManager(role) || (canWrite(role) && doc.uploadedById === user.id)))
    throw new Error("Nemáš oprávnění.");
  return { user, doc };
}

/** Ručně spustit (nebo zopakovat) vytěžení přílohy. Běží na pozadí. */
export async function startExtraction(formData: FormData) {
  const { user, doc } = await docCtx(String(formData.get("documentId")));
  const id = await createExtraction(doc.id, user.id);
  after(() => runExtraction(id));
  revalidatePath(`/projects/${doc.projectId}`);
}

/** Návrh a data pro potvrzovací dialog. */
export async function getExtraction(extractionId: string) {
  const user = await requireUser();
  const ex = await prisma.extraction.findUnique({
    where: { id: extractionId },
    select: {
      id: true,
      projectId: true,
      status: true,
      result: true,
      costUsd: true,
      document: { select: { originalName: true } },
    },
  });
  if (!ex) throw new Error("Návrh nenalezen.");
  const role = await getProjectRole(ex.projectId, user);
  if (!isManager(role)) throw new Error("Návrh potvrzuje správce projektu.");
  const project = await prisma.project.findUnique({ where: { id: ex.projectId }, select: { ownerId: true } });
  const result = ex.result as ExtractionResult | null;

  const [requests, vendors] = await Promise.all([
    prisma.request.findMany({
      where: { projectId: ex.projectId },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.vendor.findMany({
      where: { ownerId: project!.ownerId },
      select: { id: true, name: true, ico: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Existující dodavatel: podle IČO, e-mailu, nebo shodného názvu.
  const v = result?.vendor;
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const match =
    (v?.ico && vendors.find((x) => norm(x.ico) && norm(x.ico) === norm(v.ico))) ||
    (v?.email && vendors.find((x) => x.email.toLowerCase() === v.email!.toLowerCase())) ||
    (v?.name && vendors.find((x) => x.name.trim().toLowerCase() === v.name!.trim().toLowerCase())) ||
    null;

  return {
    id: ex.id,
    status: ex.status,
    fileName: ex.document.originalName,
    result,
    requests,
    vendors: vendors.map((x) => ({ id: x.id, name: x.name })),
    matchedVendorId: match ? match.id : null,
  };
}

/**
 * Potvrdit návrh: případně založit dodavatele a ke každé vybrané části
 * nabídku u příslušné žádanky.
 */
export async function applyExtraction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const ex = await prisma.extraction.findUnique({
    where: { id },
    select: { id: true, projectId: true, status: true, result: true, document: { select: { originalName: true } } },
  });
  if (!ex || !ex.result) throw new Error("Návrh nenalezen.");
  if (ex.status === "applied") throw new Error("Návrh už byl použit.");
  const role = await getProjectRole(ex.projectId, user);
  if (!isManager(role)) throw new Error("Návrh potvrzuje správce projektu.");
  const project = await prisma.project.findUnique({ where: { id: ex.projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");
  const result = ex.result as unknown as ExtractionResult;

  // Dodavatel
  let vendorId: string | null = null;
  const vendorMode = String(formData.get("vendorMode") || "new");
  if (vendorMode === "existing") {
    const v = await prisma.vendor.findFirst({
      where: { id: String(formData.get("vendorId") || ""), ownerId: project.ownerId },
      select: { id: true },
    });
    if (!v) throw new Error("Vyber dodavatele.");
    vendorId = v.id;
  } else if (vendorMode === "new") {
    const name = String(formData.get("vendorName") || "").trim();
    const email = String(formData.get("vendorEmail") || "").trim().toLowerCase();
    if (!name) throw new Error("Zadej název dodavatele.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Zadej e-mail dodavatele.");
    const dup = await prisma.vendor.findFirst({
      where: { ownerId: project.ownerId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    vendorId =
      dup?.id ??
      (
        await prisma.vendor.create({
          data: {
            ownerId: project.ownerId,
            name,
            email,
            ico: String(formData.get("vendorIco") || "").trim() || null,
            dic: result.vendor.dic,
            phone: String(formData.get("vendorPhone") || "").trim() || null,
            address: result.vendor.address,
            description: [result.vendor.contactPerson && `Kontakt: ${result.vendor.contactPerson}`, result.vendor.web]
              .filter(Boolean)
              .join(" · ") || null,
          },
          select: { id: true },
        })
      ).id;
  }

  // Nabídky – jen zaškrtnuté části s platnou žádankou tohoto projektu
  const validReq = new Set(
    (await prisma.request.findMany({ where: { projectId: ex.projectId }, select: { id: true } })).map((r) => r.id),
  );
  const head = [
    result.offerNumber && `Nabídka ${result.offerNumber}`,
    result.offerDate && `ze dne ${result.offerDate.split("-").reverse().join(".")}`,
    result.validUntil && `platná do ${result.validUntil.split("-").reverse().join(".")}`,
  ]
    .filter(Boolean)
    .join(" ");
  const offers = result.parts
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => formData.get(`use_${i}`) === "1")
    .map(({ p, i }) => {
      const requestId = String(formData.get(`req_${i}`) || "");
      const priceRaw = String(formData.get(`price_${i}`) || "").replace(/\s/g, "").replace(",", ".");
      const price = priceRaw ? Number(priceRaw) : null;
      return { p, requestId, price: price != null && !isNaN(price) ? price : null };
    })
    .filter((o) => validReq.has(o.requestId));
  if (offers.length === 0 && vendorMode !== "new") throw new Error("Vyber aspoň jednu část nabídky a její žádanku.");

  await prisma.$transaction([
    ...offers.map(({ p, requestId, price }) =>
      prisma.offer.create({
        data: {
          requestId,
          vendorId,
          vendorName: vendorId ? null : result.vendor.name,
          price,
          createdById: user.id,
          note: [
            p.label,
            p.items.length > 1 ? p.items.map((x) => `• ${x}`).join("\n") : null,
            p.priceWithoutVat != null && p.priceWithVat != null
              ? `bez DPH ${p.priceWithoutVat.toLocaleString("cs-CZ")} Kč / s DPH ${p.priceWithVat.toLocaleString("cs-CZ")} Kč`
              : null,
            p.leadTime && `Dodání: ${p.leadTime}`,
            p.note,
            [head, `(${ex.document.originalName}, vytěženo AI)`].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      }),
    ),
    prisma.extraction.update({ where: { id: ex.id }, data: { status: "applied" } }),
  ]);
  revalidatePath(`/projects/${ex.projectId}`);
  return { offers: offers.length };
}

export async function dismissExtraction(formData: FormData) {
  const user = await requireUser();
  const ex = await prisma.extraction.findUnique({
    where: { id: String(formData.get("id")) },
    select: { id: true, projectId: true },
  });
  if (!ex) return;
  if (!isManager(await getProjectRole(ex.projectId, user))) throw new Error("Nemáš oprávnění.");
  await prisma.extraction.update({ where: { id: ex.id }, data: { status: "dismissed" } });
  revalidatePath(`/projects/${ex.projectId}`);
}
