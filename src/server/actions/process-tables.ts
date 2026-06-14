"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { validateFormula } from "@/lib/formula";
import { calcOperation, type CalcOperation } from "@/lib/process-calc";
import { getProjectAccess, expandScope } from "@/server/access";
import { recomputeSchedule } from "@/server/actions/tasks";

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

// ---------------------------------------------------------------------------
// Integrace do fází: generování úkolů + žádanek z katalogu
// ---------------------------------------------------------------------------

export type CalcOperationDTO = CalcOperation & {
  code: string;
  paramsMeta: { key: string; label: string; unit: string | null; defaultValue: number | null }[];
};

/** Vrátí katalog úkonů ve formě pro klientskou kalkulačku/dialog. */
export async function listOperationsForCalc(): Promise<CalcOperationDTO[]> {
  const user = await requireUser();
  const ops = await prisma.operation.findMany({
    where: { ownerId: user.id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      params: { orderBy: { sort: "asc" } },
      materials: { include: { material: { select: { id: true, name: true, unit: true, unitPrice: true } } } },
    },
  });
  return ops.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    unit: o.unit,
    quantityFormula: o.quantityFormula,
    laborFormula: o.laborFormula,
    params: o.params.map((p) => ({ key: p.key, defaultValue: p.defaultValue != null ? Number(p.defaultValue) : null })),
    paramsMeta: o.params.map((p) => ({
      key: p.key,
      label: p.label,
      unit: p.unit,
      defaultValue: p.defaultValue != null ? Number(p.defaultValue) : null,
    })),
    materials: o.materials.map((r) => ({
      materialId: r.material.id,
      name: r.material.name,
      unit: r.material.unit,
      unitPrice: Number(r.material.unitPrice),
      quantityFormula: r.quantityFormula,
      wastePct: r.wastePct != null ? Number(r.wastePct) : null,
    })),
  }));
}

const HOURS_PER_DAY = 8;

export type GenerateInput = {
  projectId: string;
  subProjectId?: string | null;
  phaseId?: string | null; // přidat do existující fáze; jinak vznikne nová
  phaseName?: string;
  lines: { operationId: string; values: Record<string, number>; multiplier?: number }[];
};

/** Z vybraných úkonů katalogu vytvoří fázi s dílčími úkoly (pracnost→dny)
 *  a žádankami na materiál (stav Poptávka, mimo forecast). */
export async function generateFromCatalog(
  input: GenerateInput,
): Promise<{ ok: true; phaseId: string } | { error: string }> {
  const user = await requireUser();
  const access = await getProjectAccess(input.projectId, user);
  if (!access || (access.role !== "owner" && access.role !== "active")) {
    return { error: "Nemáš oprávnění přidávat do projektu." };
  }
  if (!input.lines?.length) return { error: "Vyber alespoň jednu činnost." };

  // Cílová složka.
  let subProjectId = input.subProjectId || null;
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId: input.projectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
  }

  // Cílová fáze – existující nebo nová.
  let phaseId = input.phaseId || null;
  if (phaseId) {
    const phase = await prisma.task.findFirst({
      where: { id: phaseId, projectId: input.projectId, kind: "phase" },
      select: { id: true, subProjectId: true },
    });
    if (!phase) return { error: "Fáze nenalezena." };
    subProjectId = phase.subProjectId ?? null;
  }

  // Kontrola scope pro omezeného člena.
  if (access.scopeSubIds) {
    const scope = await expandScope(input.projectId, access.scopeSubIds);
    if (!subProjectId || !scope.has(subProjectId)) {
      return { error: "Do této složky nemáš oprávnění přidávat." };
    }
  }

  // Načti úkony a přepočítej na serveru (klientovi nevěříme čísla).
  const opIds = [...new Set(input.lines.map((l) => l.operationId))];
  const ops = await prisma.operation.findMany({
    where: { id: { in: opIds }, ownerId: user.id },
    include: {
      params: { orderBy: { sort: "asc" } },
      materials: { include: { material: { select: { id: true, name: true, unit: true, unitPrice: true, category: true } } } },
    },
  });
  const opMap = new Map(ops.map((o) => [o.id, o]));
  const catById = new Map<string, string>();
  for (const o of ops) for (const r of o.materials) catById.set(r.material.id, r.material.category);

  if (!phaseId) {
    const phase = await prisma.task.create({
      data: {
        projectId: input.projectId,
        subProjectId,
        kind: "phase",
        title: (input.phaseName || "").trim() || "Nová fáze",
        status: "todo",
        createdById: user.id,
      },
    });
    phaseId = phase.id;
  }

  for (const line of input.lines) {
    const op = opMap.get(line.operationId);
    if (!op) continue;
    const calcOp: CalcOperation = {
      id: op.id,
      name: op.name,
      unit: op.unit,
      quantityFormula: op.quantityFormula,
      laborFormula: op.laborFormula,
      params: op.params.map((p) => ({ key: p.key, defaultValue: p.defaultValue != null ? Number(p.defaultValue) : null })),
      materials: op.materials.map((r) => ({
        materialId: r.material.id,
        name: r.material.name,
        unit: r.material.unit,
        unitPrice: Number(r.material.unitPrice),
        quantityFormula: r.quantityFormula,
        wastePct: r.wastePct != null ? Number(r.wastePct) : null,
      })),
    };
    const res = calcOperation(calcOp, line.values || {}, line.multiplier ?? 1);
    const estimateDays = res.laborHours > 0 ? Math.max(1, Math.ceil(res.laborHours / HOURS_PER_DAY)) : null;

    const subtask = await prisma.task.create({
      data: {
        projectId: input.projectId,
        subProjectId,
        parentId: phaseId,
        kind: "task",
        title: op.name,
        status: "todo",
        estimateDays,
        createdById: user.id,
      },
    });

    for (const mat of res.materials) {
      if (mat.quantity <= 0) continue;
      await prisma.request.create({
        data: {
          projectId: input.projectId,
          subProjectId,
          taskId: subtask.id,
          title: mat.name,
          quantity: mat.quantity,
          unit: mat.unit,
          price: mat.cost,
          category: catById.get(mat.materialId) || "other",
          status: "poptavka",
          createdById: user.id,
        },
      });
    }
  }

  // Přepočítej rozvrh (dílčí úkoly dostanou termíny dle délek/návazností).
  const fd = new FormData();
  fd.set("projectId", input.projectId);
  if (subProjectId) fd.set("subProjectId", subProjectId);
  await recomputeSchedule(fd);

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/planning");
  return { ok: true, phaseId };
}
