"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type VendorFormState = { error?: string; ok?: boolean } | undefined;

const vendorSchema = z.object({
  name: z.string().min(1, "Zadej název dodavatele."),
  email: z.email("Zadej platný e-mail."),
  category: z.string().default("other"),
  phone: z.string().optional(),
  description: z.string().optional(),
});

export async function createVendor(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const user = await requireUser();

  const parsed = vendorSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    category: formData.get("category") || "other",
    phone: formData.get("phone") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  }

  const existing = await prisma.vendor.findFirst({
    where: { ownerId: user.id, email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return { error: "Dodavatel s tímto e-mailem už v evidenci je." };
  }

  await prisma.vendor.create({
    data: { ...parsed.data, ownerId: user.id },
  });

  revalidatePath("/vendors");
  return { ok: true };
}

export async function deleteVendor(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.vendor.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/vendors");
}
