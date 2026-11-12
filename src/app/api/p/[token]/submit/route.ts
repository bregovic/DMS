import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { fetchAres } from "@/server/doc-scan";
import { requestFolder } from "@/server/document-files";
import { notifyUsers } from "@/server/notify";
import { dropComparisons } from "@/server/comparisons";
import {
  PORTAL_FILE_TYPES,
  PORTAL_MAX_FILE,
  PORTAL_MAX_TOTAL,
  newTrackingCode,
  readOfferFields,
  resolvePortalToken,
  tenderAcceptsOffers,
} from "@/server/tenders";

/**
 * Podání nabídky z dodavatelského portálu (#49). Veřejné – bez přihlášení,
 * proto: strop pokusů na IP, kontrola typu a velikosti souborů, past na
 * roboty (skryté pole) a zápis jen do žádanek, které řízení obsahuje.
 */

const hits = new Map<string, number[]>();
const WINDOW = 60 * 60_000;
const MAX_PER_WINDOW = 12;

function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_PER_WINDOW;
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
}

function txt(v: FormDataEntryValue | null, max: number) {
  return String(v ?? "").trim().slice(0, max) || null;
}

function date(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/p/[token]/submit">) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (limited(ip)) return bad("Příliš mnoho pokusů. Zkuste to prosím za hodinu.", 429);

  const { token } = await ctx.params;
  const ref = await resolvePortalToken(token);
  if (!ref) return bad("Poptávka nenalezena.", 404);

  const tender = await prisma.tender.findUnique({
    where: { id: ref.tenderId },
    select: {
      id: true,
      title: true,
      status: true,
      deadline: true,
      projectId: true,
      subProjectId: true,
      createdById: true,
      project: { select: { ownerId: true } },
      requests: {
        select: {
          request: {
            select: { id: true, title: true, status: true, subProjectId: true, offerFields: true },
          },
        },
      },
    },
  });
  if (!tender) return bad("Poptávka nenalezena.", 404);
  if (!tenderAcceptsOffers(tender)) return bad("Příjem nabídek už skončil.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Formulář se nepodařilo odeslat. Zkuste menší přílohy.");
  }
  // Past na roboty: pole je skryté, člověk ho nevyplní.
  if (txt(form.get("website"), 200)) return Response.json({ code: null });

  const ico = String(form.get("ico") ?? "").replace(/\D/g, "").slice(0, 8) || null;
  const email = txt(form.get("email"), 200)?.toLowerCase() ?? null;
  let companyName = txt(form.get("companyName"), 200);
  const phone = txt(form.get("phone"), 50);
  const note = txt(form.get("note"), 4000);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Vyplňte platný e-mail.");
  if (ico && ico.length !== 8) return bad("IČO má 8 číslic.");
  if (!ico && !companyName) return bad("Vyplňte IČO nebo název firmy.");

  // Nabídky po žádankách
  type Draft = {
    requestId: string;
    title: string;
    subProjectId: string | null;
    price: number | null;
    priceWithoutVat: number | null;
    vatRate: number | null;
    deliveryDate: Date | null;
    validUntil: Date | null;
    note: string | null;
    params: { label: string; value: string }[];
    files: File[];
  };
  const drafts: Draft[] = [];
  let total = 0;
  for (const { request: r } of tender.requests) {
    if (String(form.get(`offer_${r.id}`) ?? "") !== "1") continue;
    const vatRaw = String(form.get(`vatRate_${r.id}`) ?? "");
    const vatRate = vatRaw === "" ? null : Number(vatRaw);
    let priceWithoutVat = num(form.get(`priceWithoutVat_${r.id}`));
    let price = num(form.get(`price_${r.id}`));
    if (vatRate != null && ![0, 12, 21].includes(vatRate)) return bad("Neplatná sazba DPH.");
    if (vatRate != null && priceWithoutVat != null && price == null)
      price = Math.round(priceWithoutVat * (1 + vatRate / 100) * 100) / 100;
    if (vatRate != null && price != null && priceWithoutVat == null)
      priceWithoutVat = Math.round((price / (1 + vatRate / 100)) * 100) / 100;
    if (price == null && priceWithoutVat == null) return bad(`Doplňte cenu u položky „${r.title}“.`);

    const fields = readOfferFields(r.offerFields);
    const params: { label: string; value: string }[] = [];
    for (let i = 0; i < fields.length; i++) {
      const value = txt(form.get(`param_${r.id}_${i}`), 500);
      if (!value && fields[i].required) return bad(`Doplňte „${fields[i].label}“ u položky „${r.title}“.`);
      if (value) params.push({ label: fields[i].unit ? `${fields[i].label} [${fields[i].unit}]` : fields[i].label, value });
    }

    const files = form.getAll(`file_${r.id}`).filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
    for (const f of files) {
      if (f.size > PORTAL_MAX_FILE) return bad(`Soubor „${f.name}“ je větší než 15 MB.`);
      if (!PORTAL_FILE_TYPES.test(f.type)) return bad(`Soubor „${f.name}“: přiložte PDF, obrázek, Word nebo Excel.`);
      total += f.size;
    }
    drafts.push({
      requestId: r.id,
      title: r.title,
      subProjectId: r.subProjectId,
      price,
      priceWithoutVat,
      vatRate,
      deliveryDate: date(form.get(`delivery_${r.id}`)),
      validUntil: date(form.get(`valid_${r.id}`)),
      note: txt(form.get(`note_${r.id}`), 2000),
      params,
      files,
    });
  }
  if (!drafts.length) return bad("Vyberte aspoň jednu položku, na kterou podáváte nabídku.");
  if (total > PORTAL_MAX_TOTAL) return bad("Přílohy mají dohromady víc než 40 MB.");

  // Dodavatel v evidenci vlastníka: z pozvánky, podle IČO nebo e-mailu, jinak nový.
  const ownerId = tender.project.ownerId;
  const ares = ico ? await fetchAres(ico) : null;
  if (ares?.name) companyName = ares.name;
  let vendorId: string | null = null;
  if (ref.inviteId) {
    vendorId = (await prisma.tenderInvite.findUnique({ where: { id: ref.inviteId }, select: { vendorId: true } }))?.vendorId ?? null;
  }
  if (!vendorId) {
    const found = await prisma.vendor.findFirst({
      where: {
        ownerId,
        OR: [...(ico ? [{ ico }] : []), { email: { equals: email, mode: "insensitive" as const } }],
      },
      select: { id: true },
    });
    vendorId = found?.id ?? null;
  }
  if (!vendorId) {
    const emailTaken = await prisma.vendor.findFirst({ where: { ownerId, email }, select: { id: true } });
    const v = await prisma.vendor.create({
      data: {
        ownerId,
        name: (companyName || ico || email).slice(0, 200),
        email: emailTaken ? null : email,
        phone,
        ico,
        dic: ares?.dic ?? null,
        address: ares?.address ?? null,
        category: "other",
      },
      select: { id: true },
    });
    vendorId = v.id;
  } else {
    // Chybějící kontakty se doplní, nic se nepřepisuje.
    const v = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { email: true, phone: true, ico: true } });
    if (v) {
      const emailTaken = !v.email ? await prisma.vendor.findFirst({ where: { ownerId, email }, select: { id: true } }) : null;
      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          ...(!v.email && !emailTaken ? { email } : {}),
          ...(!v.phone && phone ? { phone } : {}),
          ...(!v.ico && ico ? { ico } : {}),
        },
      });
    }
  }

  let code = newTrackingCode();
  for (let i = 0; i < 3 && (await prisma.tenderSubmission.findUnique({ where: { code }, select: { id: true } })); i++)
    code = newTrackingCode();

  const submission = await prisma.tenderSubmission.create({
    data: {
      tenderId: tender.id,
      inviteId: ref.inviteId,
      vendorId,
      code,
      companyName: (companyName || ico || email).slice(0, 200),
      ico,
      email,
      phone,
      note,
    },
    select: { id: true },
  });

  for (const d of drafts) {
    const offer = await prisma.offer.create({
      data: {
        requestId: d.requestId,
        vendorId,
        submissionId: submission.id,
        price: d.price,
        priceWithoutVat: d.priceWithoutVat,
        vatRate: d.vatRate,
        deliveryDate: d.deliveryDate,
        validUntil: d.validUntil,
        note: [d.note, note].filter(Boolean).join("\n\n").slice(0, 4000) || null,
        params: d.params,
        status: "nova",
        createdById: tender.createdById,
      },
      select: { id: true },
    });
    for (const f of d.files) {
      const buf = Buffer.from(await f.arrayBuffer());
      const key = await storage.save(buf, f.name, `${requestFolder(ownerId, tender.projectId, d.requestId)}/nabidky`);
      await prisma.document.create({
        data: {
          projectId: tender.projectId,
          subProjectId: d.subProjectId,
          offerId: offer.id,
          fileName: key,
          originalName: f.name.slice(0, 250),
          mimeType: f.type,
          size: buf.length,
          type: "offer",
          summary: `Portál · ${companyName ?? email}`.slice(0, 500),
          uploadedById: tender.createdById,
        },
      });
    }
  }

  const requestIds = drafts.map((d) => d.requestId);
  await prisma.request.updateMany({ where: { id: { in: requestIds }, status: "poptavka" }, data: { status: "nabidka" } });
  await dropComparisons({ requestIds }).catch(() => undefined);

  await notifyUsers([tender.createdById, ownerId], {
    kind: "tender_offer",
    title: `Nová nabídka: ${companyName ?? email}`,
    body: `${tender.title} · ${drafts.map((d) => d.title).join(", ")}`,
    href: `/projects/${tender.projectId}/rizeni/${tender.id}`,
    projectId: tender.projectId,
  }).catch(() => undefined);

  return Response.json({ code });
}
