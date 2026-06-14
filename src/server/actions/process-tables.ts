"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type FormState = { error?: string; ok?: boolean } | undefined;

function toDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Materiály
// ---------------------------------------------------------------------------

const materialSchema = z.object({
  code: z.string().min(1, "Zadej kód materiálu."),
  name: z.string().min(1, "Zadej název materiálu."),
  unit: z.string().min(1).default("ks"),
  unitPrice: z.coerce.number().min(0, "Cena nesmí být záporná.").default(0),
  priceSource: z.string().optional(),
  category: z.string().optional(),
  note: z.string().optional(),
});

function parseMaterial(formData: FormData) {
  return materialSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    unit: formData.get("unit") || "ks",
    unitPrice: formData.get("unitPrice") || 0,
    priceSource: formData.get("priceSource") || undefined,
    category: formData.get("category") || undefined,
    note: formData.get("note") || undefined,
  });
}

export async function createMaterial(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseMaterial(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };

  const dup = await prisma.material.findFirst({
    where: { ownerId: user.id, code: parsed.data.code },
    select: { id: true },
  });
  if (dup) return { error: "Materiál s tímto kódem už existuje." };

  await prisma.material.create({
    data: {
      ownerId: user.id,
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
      unitPrice: parsed.data.unitPrice,
      priceSource: parsed.data.priceSource ?? null,
      priceDate: toDate(formData.get("priceDate")),
      category: parsed.data.category || "other",
      note: parsed.data.note ?? null,
    },
  });
  revalidatePath("/katalog/materialy");
  return { ok: true };
}

export async function updateMaterial(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const parsed = parseMaterial(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };

  const existing = await prisma.material.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!existing) return { error: "Materiál nenalezen." };

  const dup = await prisma.material.findFirst({
    where: { ownerId: user.id, code: parsed.data.code, NOT: { id } },
    select: { id: true },
  });
  if (dup) return { error: "Jiný materiál s tímto kódem už existuje." };

  await prisma.material.update({
    where: { id },
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
      unitPrice: parsed.data.unitPrice,
      priceSource: parsed.data.priceSource ?? null,
      priceDate: toDate(formData.get("priceDate")),
      category: parsed.data.category || "other",
      note: parsed.data.note ?? null,
    },
  });
  revalidatePath("/katalog/materialy");
  return { ok: true };
}

export async function deleteMaterial(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const used = await prisma.operationMaterial.count({ where: { materialId: id, material: { ownerId: user.id } } });
  if (used > 0) {
    throw new Error("Materiál je použitý v receptu úkonu – nejdřív ho odeber z receptů.");
  }
  await prisma.material.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/katalog/materialy");
}
