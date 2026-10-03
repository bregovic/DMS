"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type VendorFormState = { error?: string; ok?: boolean } | undefined;

/**
 * Dodavatele drží pohromadě aspoň jeden identifikátor: IČO, e-mail nebo
 * telefon. IČO je nejspolehlivější (ARES, párování dokladů), e-mail je ale
 * jediné, čím lze dodavatele spojit s přístupem do projektu – přihlašuje se
 * jím. Bez e-mailu je to jen kontakt.
 */
const vendorSchema = z
  .object({
    name: z.string().min(1, "Zadej název dodavatele."),
    email: z.union([z.literal(""), z.email("Zadej platný e-mail.")]).optional(),
    category: z.string().default("other"),
    phone: z.string().optional(),
    description: z.string().optional(),
    ico: z.string().optional(),
    dic: z.string().optional(),
    address: z.string().optional(),
    bankAccount: z.string().optional(),
    hourlyRate: z.coerce.number().positive().optional(),
  })
  .refine((v) => !!(v.email || (v.ico ?? "").replace(/\D/g, "") || (v.phone ?? "").replace(/\D/g, "")), {
    message: "Zadej aspoň jedno: IČO, e-mail, nebo telefon.",
    path: ["email"],
  })
  .transform((v) => ({ ...v, email: v.email || undefined }));

function parse(formData: FormData) {
  return vendorSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    category: formData.get("category") || "other",
    phone: formData.get("phone") || undefined,
    description: formData.get("description") || undefined,
    ico: formData.get("ico") || undefined,
    dic: formData.get("dic") || undefined,
    address: formData.get("address") || undefined,
    bankAccount: formData.get("bankAccount") || undefined,
    hourlyRate: formData.get("hourlyRate") || undefined,
  });
}

export async function createVendor(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const user = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  }

  // Sdílený číselník: dodavatel se hledá GLOBÁLNĚ podle IČO (normalizované),
  // jinak podle e-mailu. Když už v systému je, nezakládáme duplicitu.
  const existing = await findVendorByIcoOrEmail(
    parsed.data.ico,
    parsed.data.email,
    undefined,
    parsed.data.phone,
  );
  if (existing) {
    return {
      error: `Dodavatel „${existing.name}" už v systému existuje a je dostupný všem uživatelům.`,
    };
  }

  await prisma.vendor.create({ data: { ...parsed.data, ownerId: user.id } });
  revalidatePath("/vendors");
  return { ok: true };
}

/** Najde existujícího dodavatele napříč všemi uživateli podle kteréhokoli
 *  identifikátoru: IČO (po odstranění nečíslic), e-mail (bez ohledu na
 *  velikost písmen), nebo telefon (po odstranění nečíslic a předvolby). */
async function findVendorByIcoOrEmail(
  ico: string | undefined,
  email: string | undefined,
  excludeId?: string,
  phone?: string,
): Promise<{ id: string; name: string } | null> {
  const cislice = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  const not = excludeId ? { NOT: { id: excludeId } } : {};
  const icoNorm = cislice(ico);
  if (icoNorm) {
    const cands = await prisma.vendor.findMany({
      where: { ico: { not: null }, ...not },
      select: { id: true, name: true, ico: true },
    });
    const hit = cands.find((c) => cislice(c.ico) === icoNorm);
    if (hit) return { id: hit.id, name: hit.name };
  }
  if (email) {
    const hit = await prisma.vendor.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, ...not },
      select: { id: true, name: true },
    });
    if (hit) return hit;
  }
  // Telefon až nakonec – poslední devět číslic, ať nerozhoduje předvolba.
  const tel = cislice(phone).slice(-9);
  if (tel.length === 9) {
    const cands = await prisma.vendor.findMany({
      where: { phone: { not: null }, ...not },
      select: { id: true, name: true, phone: true },
    });
    const hit = cands.find((c) => cislice(c.phone).slice(-9) === tel);
    if (hit) return { id: hit.id, name: hit.name };
  }
  return null;
}

export async function updateVendor(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  }

  const existing = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { error: "Dodavatel nenalezen." };

  const dup = await findVendorByIcoOrEmail(parsed.data.ico, parsed.data.email, id, parsed.data.phone);
  if (dup) return { error: `Jiný dodavatel („${dup.name}") s tímto IČO/e-mailem už existuje.` };

  await prisma.vendor.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      category: parsed.data.category,
      phone: parsed.data.phone ?? null,
      description: parsed.data.description ?? null,
      ico: parsed.data.ico ?? null,
      dic: parsed.data.dic ?? null,
      address: parsed.data.address ?? null,
      bankAccount: parsed.data.bankAccount ?? null,
      hourlyRate: parsed.data.hourlyRate ?? null,
    },
  });
  revalidatePath("/vendors");
  return { ok: true };
}

export async function deleteVendor(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  // Sdílený číselník – maže kterýkoli přihlášený uživatel (volá jen owner UI).
  await prisma.vendor.deleteMany({ where: { id } });
  revalidatePath("/vendors");
}
