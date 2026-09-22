import { prisma } from "@/lib/prisma";
import { dropComparisons } from "@/server/comparisons";
import type { Prisma } from "@/generated/prisma/client";
import type { ExtractedPart, ExtractionResult } from "@/server/extraction";

/**
 * Založení nabídek z vytěženého dokumentu (#33).
 *
 * Jádro odděleně od serverové akce, protože se volá dvěma cestami:
 * z potvrzovacího dialogu a ze samočinného zpracování doručené pošty.
 * Oprávnění řeší volající.
 */

export type ApplyInput = {
  extractionId: string;
  userId: string;
  /** Dodavatel: nalezený v evidenci, nebo se založí z vytěžených údajů. */
  vendorId: string | null;
  createVendor: boolean;
  /** Části k založení: index části a žádanka, na kterou míří (+ ruční cena). */
  parts: { index: number; requestId: string; price: number | null }[];
};

export type ApplyResult = {
  offers: number;
  requests: string[];
  vendorCreated: boolean;
};

const soucet = (hodnoty: (number | null | undefined)[]) => {
  const znama = hodnoty.filter((x): x is number => x != null);
  return znama.length ? znama.reduce((a, b) => a + b, 0) : null;
};
const kc = (x: number) => `${x.toLocaleString("cs-CZ")} Kč`;

/** Dodavatel podle IČO, e-mailu nebo shodného názvu. */
export async function matchVendor(ownerId: string, v: ExtractionResult["vendor"]) {
  const cislice = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const vendors = await prisma.vendor.findMany({
    where: { ownerId },
    select: { id: true, name: true, ico: true, email: true, bankAccount: true },
  });
  return (
    (v.ico && vendors.find((x) => cislice(x.ico) && cislice(x.ico) === cislice(v.ico))) ||
    (v.email && vendors.find((x) => x.email.toLowerCase() === v.email!.toLowerCase())) ||
    (v.name && vendors.find((x) => x.name.trim().toLowerCase() === v.name!.trim().toLowerCase())) ||
    null
  );
}

/**
 * Hlavička nabídky do poznámky: číslo, datum, platnost, platební podmínky.
 */
function hlavicka(result: ExtractionResult, fileName: string) {
  const datum = (d: string) => d.split("-").reverse().join(".");
  return [
    result.offerNumber && `Nabídka ${result.offerNumber}`,
    result.offerDate && `ze dne ${datum(result.offerDate)}`,
    result.validUntil && `platná do ${datum(result.validUntil)}`,
    result.paymentTerms && `· platba: ${result.paymentTerms}`,
    `(${fileName}, zpracováno z přílohy)`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Části mířící na stejnou žádanku patří do jedné nabídky. Dodavatel často
 * rozepíše nabídku po kusech (okno koupelna, okno ložnice…), ale poptávka
 * je jedna – bez sloučení by u ní vznikla řada nabídek téže firmy
 * s dílčími cenami a porovnání by ji vidělo několikrát pod cenou.
 */
export function mergeParts(
  vybrane: { index: number; requestId: string; price: number | null; p: ExtractedPart }[],
  head: string,
) {
  const skupiny = new Map<string, typeof vybrane>();
  for (const o of vybrane) skupiny.set(o.requestId, [...(skupiny.get(o.requestId) ?? []), o]);

  return [...skupiny.entries()].map(([requestId, casti]) => {
    const bezDph = soucet(casti.map((x) => x.p.priceWithoutVat));
    const sDph = soucet(casti.map((x) => x.p.priceWithVat));
    const polozky = casti.flatMap((x) => (casti.length > 1 ? [x.p.label, ...x.p.items] : x.p.items));
    const rozpory = [...new Set(casti.flatMap((x) => x.p.mismatches ?? []))];
    const dodani = casti.map((x) => x.p.leadTime).find(Boolean);
    return {
      requestId,
      indexy: casti.map((x) => x.index),
      // Ručně zadaná cena má přednost; jinak součet částí (s DPH, jinak bez).
      price: soucet(casti.map((x) => x.price)) ?? sDph ?? bezDph,
      planTasks: casti.flatMap((x) => x.p.tasks ?? []),
      mismatch: rozpory.length ? rozpory.join("\n") : null,
      note: [
        casti.length > 1 ? `${casti.length} položky nabídky sloučeny do jedné` : casti[0].p.label,
        polozky.length ? polozky.map((x) => `• ${x}`).join("\n") : null,
        bezDph != null || sDph != null
          ? `Celkem${bezDph != null ? ` bez DPH ${kc(bezDph)}` : ""}${sDph != null ? ` / s DPH ${kc(sDph)}` : ""}`
          : null,
        dodani && `Dodání: ${dodani}`,
        casti
          .map((x) => x.p.note)
          .filter(Boolean)
          .join(" "),
        head,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  });
}

export async function applyExtractionCore(input: ApplyInput): Promise<ApplyResult> {
  const ex = await prisma.extraction.findUnique({
    where: { id: input.extractionId },
    select: {
      id: true,
      projectId: true,
      status: true,
      result: true,
      appliedParts: true,
      document: { select: { originalName: true } },
    },
  });
  if (!ex?.result) throw new Error("Návrh nenalezen.");
  if (ex.status === "applied") throw new Error("Všechny části návrhu už jsou založené.");
  const project = await prisma.project.findUnique({ where: { id: ex.projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");
  const result = ex.result as unknown as ExtractionResult;

  // Dodavatel
  let vendorId = input.vendorId;
  let vendorCreated = false;
  if (!vendorId && input.createVendor && result.vendor.name) {
    const email =
      result.vendor.email?.trim().toLowerCase() ||
      // Bez e-mailu by se dodavatel nedal založit (je unikátní na účet);
      // náhradní adresa drží záznam pohromadě a jde ji později opravit.
      `${(result.vendor.ico || Date.now()).toString().replace(/\D/g, "")}@bez-adresy.local`;
    const dup = await prisma.vendor.findFirst({
      where: { ownerId: project.ownerId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (dup) vendorId = dup.id;
    else {
      const v = await prisma.vendor.create({
        data: {
          ownerId: project.ownerId,
          name: result.vendor.name.slice(0, 200),
          email,
          ico: result.vendor.ico,
          dic: result.vendor.dic,
          phone: result.vendor.phone,
          address: result.vendor.address,
          bankAccount: result.vendor.bankAccount,
          description:
            [result.vendor.contactPerson && `Kontakt: ${result.vendor.contactPerson}`, result.vendor.web]
              .filter(Boolean)
              .join(" · ") || null,
        },
        select: { id: true },
      });
      vendorId = v.id;
      vendorCreated = true;
    }
  }

  const validReq = new Set(
    (await prisma.request.findMany({ where: { projectId: ex.projectId }, select: { id: true } })).map((r) => r.id),
  );
  const vybrane = input.parts
    .filter((x) => !ex.appliedParts.includes(x.index) && validReq.has(x.requestId) && result.parts[x.index])
    .map((x) => ({ ...x, p: result.parts[x.index] }));
  if (vybrane.length === 0) throw new Error("Vyber aspoň jednu část nabídky a její žádanku.");

  const offers = mergeParts(vybrane, hlavicka(result, ex.document.originalName));
  const applied = [...new Set([...ex.appliedParts, ...vybrane.map((x) => x.index)])];
  const allDone = result.parts.every((_, i) => applied.includes(i));

  await prisma.$transaction([
    ...offers.map((o) =>
      prisma.offer.create({
        data: {
          requestId: o.requestId,
          extractionId: ex.id,
          extractionPart: o.indexy[0],
          planTasks: o.planTasks as unknown as Prisma.InputJsonValue,
          vendorId,
          vendorName: vendorId ? null : result.vendor.name,
          price: o.price,
          mismatch: o.mismatch,
          createdById: input.userId,
          note: o.note,
        },
      }),
    ),
    prisma.extraction.update({
      where: { id: ex.id },
      data: { status: allDone ? "applied" : "partial", appliedParts: applied },
    }),
  ]);

  // Nabídky se změnily – starý report by mluvil o jiné skutečnosti.
  await dropComparisons({ requestIds: offers.map((o) => o.requestId) });

  const nazvy = await prisma.request.findMany({
    where: { id: { in: offers.map((o) => o.requestId) } },
    select: { title: true },
  });
  return { offers: offers.length, requests: nazvy.map((r) => r.title), vendorCreated };
}
