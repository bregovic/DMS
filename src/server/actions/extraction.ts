"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager, canWrite } from "@/server/access";
import {
  createBundleComparison,
  createComparison,
  createExtraction,
  runBundleComparison,
  runComparison,
  extractable,
  runExtraction,
  type ExtractionResult,
} from "@/server/extraction";
import { applyExtractionCore } from "@/server/extraction-apply";

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
  const id = await createExtraction(doc.id, user.id, String(formData.get("instructions") || ""));
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
      requestId: true,
      appliedParts: true,
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

  // Už založené nabídky z tohoto návrhu (po částech).
  const made = await prisma.offer.findMany({
    where: { extractionId: ex.id },
    select: { extractionPart: true, request: { select: { title: true } } },
  });
  const madeParts: Record<number, string> = {};
  for (const m of made) if (m.extractionPart != null) madeParts[m.extractionPart] = m.request.title;

  return {
    id: ex.id,
    status: ex.status,
    requestId: ex.requestId,
    madeParts,
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
    select: { id: true, projectId: true, result: true },
  });
  if (!ex?.result) throw new Error("Návrh nenalezen.");
  if (!isManager(await getProjectRole(ex.projectId, user))) throw new Error("Návrh potvrzuje správce projektu.");
  const project = await prisma.project.findUnique({ where: { id: ex.projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");
  const result = ex.result as unknown as ExtractionResult;

  // Dodavatel: vybraný z evidence, nebo nový z vytěžených údajů.
  const vendorMode = String(formData.get("vendorMode") || "new");
  let vendorId: string | null = null;
  if (vendorMode === "existing") {
    const v = await prisma.vendor.findFirst({
      where: { id: String(formData.get("vendorId") || ""), ownerId: project.ownerId },
      select: { id: true, bankAccount: true },
    });
    if (!v) throw new Error("Vyber dodavatele.");
    vendorId = v.id;
    // Účet z nabídky doplnit, jen když ho dodavatel ještě nemá (nepřepisovat).
    if (result.vendor.bankAccount && !v.bankAccount)
      await prisma.vendor.update({ where: { id: v.id }, data: { bankAccount: result.vendor.bankAccount } });
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
            bankAccount: result.vendor.bankAccount,
            description:
              [result.vendor.contactPerson && `Kontakt: ${result.vendor.contactPerson}`, result.vendor.web]
                .filter(Boolean)
                .join(" · ") || null,
          },
          select: { id: true },
        })
      ).id;
  }

  // Zaškrtnutá část bez vybrané žádanky je nejčastější zádrhel – radši
  // řekneme která, než obecné „vyber aspoň jednu".
  const bezZadanky = result.parts
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => formData.get(`use_${i}`) === "1" && !String(formData.get(`req_${i}`) || ""));
  if (bezZadanky.length)
    throw new Error(
      `Vyber žádanku u ${bezZadanky.length === 1 ? "části" : "částí"}: ${bezZadanky
        .map((x) => x.p.label)
        .join(", ")}.`,
    );

  const parts = result.parts
    .map((_, i) => i)
    .filter((i) => formData.get(`use_${i}`) === "1")
    .map((i) => {
      const priceRaw = String(formData.get(`price_${i}`) || "").replace(/\s/g, "").replace(",", ".");
      const price = priceRaw ? Number(priceRaw) : null;
      return {
        index: i,
        requestId: String(formData.get(`req_${i}`) || ""),
        price: price != null && !isNaN(price) ? price : null,
      };
    });

  const res = await applyExtractionCore({
    extractionId: ex.id,
    userId: user.id,
    vendorId,
    createVendor: false,
    parts,
  });
  revalidatePath(`/projects/${ex.projectId}`);
  return { offers: res.offers };
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

/** Technické údaje z dokumentu doplnit do specifikace žádanky. */
export async function appendSpecsToRequest(formData: FormData) {
  const user = await requireUser();
  const ex = await prisma.extraction.findUnique({
    where: { id: String(formData.get("id")) },
    select: { projectId: true, result: true, document: { select: { originalName: true } } },
  });
  if (!ex?.result) throw new Error("Návrh nenalezen.");
  if (!isManager(await getProjectRole(ex.projectId, user))) throw new Error("Nemáš oprávnění.");
  const req = await prisma.request.findFirst({
    where: { id: String(formData.get("requestId") || ""), projectId: ex.projectId },
    select: { id: true, description: true },
  });
  if (!req) throw new Error("Vyber žádanku.");
  const specs = (ex.result as unknown as ExtractionResult).technicalSpecs ?? [];
  if (!specs.length) throw new Error("Dokument nemá technické údaje.");
  const block = [`Z dokumentu ${ex.document.originalName}:`, ...specs.map((x) => `• ${x}`)].join("\n");
  await prisma.request.update({
    where: { id: req.id },
    data: { description: req.description ? `${req.description}\n\n${block}` : block },
  });
  revalidatePath(`/projects/${ex.projectId}`);
}

/** AI porovnání nabídek u žádanky podle pokynu. Běží na pozadí. */
export async function startComparison(formData: FormData) {
  const user = await requireUser();
  const req = await prisma.request.findUnique({
    where: { id: String(formData.get("requestId")) },
    select: { id: true, projectId: true },
  });
  if (!req) throw new Error("Žádanka nenalezena.");
  if (!isManager(await getProjectRole(req.projectId, user))) throw new Error("Porovnání spouští správce projektu.");
  const id = await createComparison(
    req.id,
    user.id,
    String(formData.get("prompt") || ""),
    formData.get("webSearch") === "1",
  );
  after(() => runComparison(id));
  revalidatePath(`/projects/${req.projectId}`);
}

/** Porovnání nabídek za celý poptávkový balíček (#40). Běží na pozadí. */
export async function startBundleComparison(formData: FormData) {
  const user = await requireUser();
  const b = await prisma.requestBundle.findUnique({
    where: { id: String(formData.get("bundleId")) },
    select: { id: true, projectId: true },
  });
  if (!b) throw new Error("Balíček nenalezen.");
  if (!isManager(await getProjectRole(b.projectId, user))) throw new Error("Porovnání spouští správce projektu.");
  const id = await createBundleComparison(
    b.id,
    user.id,
    String(formData.get("prompt") || ""),
    formData.get("webSearch") === "1",
  );
  after(() => runBundleComparison(id));
  revalidatePath(`/projects/${b.projectId}`);
}

/**
 * Zpracovat všechny dosud nezpracované přílohy žádanky – postupně, jednu
 * po druhé (kvůli limitu souběžných běhů). Běží na pozadí.
 */
export async function startRequestExtractions(formData: FormData) {
  const user = await requireUser();
  const req = await prisma.request.findUnique({
    where: { id: String(formData.get("requestId")) },
    select: { id: true, projectId: true },
  });
  if (!req) throw new Error("Žádanka nenalezena.");
  if (!isManager(await getProjectRole(req.projectId, user))) throw new Error("Přílohy zpracovává správce projektu.");
  const docs = await prisma.document.findMany({
    where: { requestId: req.id, extractions: { none: {} } },
    select: { id: true, mimeType: true, originalName: true },
    orderBy: { createdAt: "asc" },
  });
  const todo = docs.filter((d) => extractable(d.mimeType, d.originalName));
  if (todo.length === 0) throw new Error("Všechny přílohy už jsou zpracované.");
  // První založit hned (ať je vidět průběh), ostatní postupně na pozadí.
  const first = await createExtraction(todo[0].id, user.id);
  after(async () => {
    await runExtraction(first);
    for (const d of todo.slice(1)) {
      try {
        const id = await createExtraction(d.id, user.id);
        await runExtraction(id);
      } catch {
        break; // limit útraty/počtu – zbytek zůstane nezpracovaný
      }
    }
  });
  revalidatePath(`/projects/${req.projectId}`);
  return { queued: todo.length };
}
