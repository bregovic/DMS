"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { validateFormula } from "@/lib/formula";

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

// ---------------------------------------------------------------------------
// Úkony (procesy)
// ---------------------------------------------------------------------------

const operationSchema = z.object({
  code: z.string().min(1, "Zadej kód úkonu."),
  name: z.string().min(1, "Zadej název úkonu."),
  unit: z.string().min(1).default("m2"),
  quantityFormula: z.string().min(1).default("1"),
  laborFormula: z.string().min(1).default("0"),
  description: z.string().optional(),
  category: z.string().optional(),
});

function parseOperation(formData: FormData) {
  return operationSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    unit: formData.get("unit") || "m2",
    quantityFormula: String(formData.get("quantityFormula") || "").trim() || "1",
    laborFormula: String(formData.get("laborFormula") || "").trim() || "0",
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
  });
}

/** Ověří syntax vzorců; vrací chybovou hlášku nebo null. */
function checkFormulas(quantity: string, labor: string): string | null {
  const q = validateFormula(quantity);
  if (q) return `Vzorec množství: ${q}`;
  const l = validateFormula(labor);
  if (l) return `Vzorec normohodin: ${l}`;
  return null;
}

export async function createOperation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseOperation(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  const fErr = checkFormulas(parsed.data.quantityFormula, parsed.data.laborFormula);
  if (fErr) return { error: fErr };

  const dup = await prisma.operation.findFirst({
    where: { ownerId: user.id, code: parsed.data.code },
    select: { id: true },
  });
  if (dup) return { error: "Úkon s tímto kódem už existuje." };

  await prisma.operation.create({
    data: {
      ownerId: user.id,
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
      quantityFormula: parsed.data.quantityFormula,
      laborFormula: parsed.data.laborFormula,
      description: parsed.data.description ?? null,
      category: parsed.data.category || "other",
    },
  });
  revalidatePath("/katalog/ukony");
  return { ok: true };
}

export async function updateOperation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const parsed = parseOperation(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  const fErr = checkFormulas(parsed.data.quantityFormula, parsed.data.laborFormula);
  if (fErr) return { error: fErr };

  const existing = await prisma.operation.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!existing) return { error: "Úkon nenalezen." };

  const dup = await prisma.operation.findFirst({
    where: { ownerId: user.id, code: parsed.data.code, NOT: { id } },
    select: { id: true },
  });
  if (dup) return { error: "Jiný úkon s tímto kódem už existuje." };

  await prisma.operation.update({
    where: { id },
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
      quantityFormula: parsed.data.quantityFormula,
      laborFormula: parsed.data.laborFormula,
      description: parsed.data.description ?? null,
      category: parsed.data.category || "other",
    },
  });
  revalidatePath("/katalog/ukony");
  revalidatePath(`/katalog/ukony/${id}`);
  return { ok: true };
}

export async function deleteOperation(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.operation.deleteMany({ where: { id, ownerId: user.id } });
  revalidatePath("/katalog/ukony");
  redirect("/katalog/ukony");
}

/** Ověří vlastnictví úkonu přihlášeným uživatelem. */
async function ownedOperation(id: string, userId: string) {
  const op = await prisma.operation.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
  return op?.id ?? null;
}

// ---------------------------------------------------------------------------
// Parametry úkonu
// ---------------------------------------------------------------------------

const PARAM_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function addParam(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const operationId = String(formData.get("operationId"));
  if (!(await ownedOperation(operationId, user.id))) return { error: "Úkon nenalezen." };

  const key = String(formData.get("key") || "").trim();
  const label = String(formData.get("label") || "").trim();
  if (!PARAM_KEY.test(key)) {
    return { error: "Klíč smí mít jen písmena bez diakritiky, číslice a _ a nezačíná číslicí (např. delka)." };
  }
  if (!label) return { error: "Zadej popisek parametru." };

  const dup = await prisma.operationParam.findFirst({ where: { operationId, key }, select: { id: true } });
  if (dup) return { error: "Parametr s tímto klíčem už existuje." };

  const defRaw = String(formData.get("defaultValue") || "").replace(",", ".").trim();
  const defaultValue = defRaw === "" ? null : Number(defRaw);
  const count = await prisma.operationParam.count({ where: { operationId } });

  await prisma.operationParam.create({
    data: {
      operationId,
      key,
      label,
      unit: String(formData.get("unit") || "").trim() || null,
      defaultValue: defaultValue != null && Number.isFinite(defaultValue) ? defaultValue : null,
      sort: count,
    },
  });
  revalidatePath(`/katalog/ukony/${operationId}`);
  return { ok: true };
}

export async function deleteParam(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const param = await prisma.operationParam.findFirst({
    where: { id, operation: { ownerId: user.id } },
    select: { operationId: true },
  });
  if (!param) return;
  await prisma.operationParam.delete({ where: { id } });
  revalidatePath(`/katalog/ukony/${param.operationId}`);
}

// ---------------------------------------------------------------------------
// Recept (spotřeba materiálu na úkon)
// ---------------------------------------------------------------------------

export async function addRecipe(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const operationId = String(formData.get("operationId"));
  if (!(await ownedOperation(operationId, user.id))) return { error: "Úkon nenalezen." };

  const materialId = String(formData.get("materialId") || "");
  const material = await prisma.material.findFirst({ where: { id: materialId, ownerId: user.id }, select: { id: true } });
  if (!material) return { error: "Vyber materiál." };

  const quantityFormula = String(formData.get("quantityFormula") || "").trim() || "0";
  const fErr = validateFormula(quantityFormula);
  if (fErr) return { error: `Vzorec spotřeby: ${fErr}` };

  const wasteRaw = String(formData.get("wastePct") || "").replace(",", ".").trim();
  const wastePct = wasteRaw === "" ? null : Number(wasteRaw);

  await prisma.operationMaterial.create({
    data: {
      operationId,
      materialId,
      quantityFormula,
      wastePct: wastePct != null && Number.isFinite(wastePct) ? wastePct : null,
      note: String(formData.get("note") || "").trim() || null,
    },
  });
  revalidatePath(`/katalog/ukony/${operationId}`);
  return { ok: true };
}

export async function updateRecipe(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const row = await prisma.operationMaterial.findFirst({
    where: { id, operation: { ownerId: user.id } },
    select: { id: true, operationId: true },
  });
  if (!row) return { error: "Řádek receptu nenalezen." };

  const materialId = String(formData.get("materialId") || "");
  const material = await prisma.material.findFirst({ where: { id: materialId, ownerId: user.id }, select: { id: true } });
  if (!material) return { error: "Vyber materiál." };

  const quantityFormula = String(formData.get("quantityFormula") || "").trim() || "0";
  const fErr = validateFormula(quantityFormula);
  if (fErr) return { error: `Vzorec spotřeby: ${fErr}` };

  const wasteRaw = String(formData.get("wastePct") || "").replace(",", ".").trim();
  const wastePct = wasteRaw === "" ? null : Number(wasteRaw);

  await prisma.operationMaterial.update({
    where: { id },
    data: {
      materialId,
      quantityFormula,
      wastePct: wastePct != null && Number.isFinite(wastePct) ? wastePct : null,
      note: String(formData.get("note") || "").trim() || null,
    },
  });
  revalidatePath(`/katalog/ukony/${row.operationId}`);
  return { ok: true };
}

export async function deleteRecipe(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const row = await prisma.operationMaterial.findFirst({
    where: { id, operation: { ownerId: user.id } },
    select: { operationId: true },
  });
  if (!row) return;
  await prisma.operationMaterial.delete({ where: { id } });
  revalidatePath(`/katalog/ukony/${row.operationId}`);
}
