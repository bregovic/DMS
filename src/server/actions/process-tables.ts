"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { validateFormula } from "@/lib/formula";
import { calcOperation, type CalcOperation } from "@/lib/process-calc";
import { getProjectAccess, expandScope, isManager, canWrite } from "@/server/access";
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
    where: { code: parsed.data.code },
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
  await requireUser();
  const id = String(formData.get("id"));
  const parsed = parseMaterial(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };

  const existing = await prisma.material.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { error: "Materiál nenalezen." };

  const dup = await prisma.material.findFirst({
    where: { code: parsed.data.code, NOT: { id } },
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
  await requireUser();
  const id = String(formData.get("id"));
  const used = await prisma.operationMaterial.count({ where: { materialId: id } });
  if (used > 0) {
    throw new Error("Materiál je použitý v receptu úkonu – nejdřív ho odeber z receptů.");
  }
  await prisma.material.deleteMany({ where: { id } });
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
  laborRate: z.coerce.number().min(0).optional(),
  crew: z.coerce.number().int().min(1).max(20).optional(),
  techPauseDays: z.coerce.number().int().min(0).max(60).optional(),
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
    laborRate: formData.get("laborRate") || undefined,
    crew: formData.get("crew") || undefined,
    techPauseDays: formData.get("techPauseDays") || undefined,
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
    where: { code: parsed.data.code },
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
      laborRate: parsed.data.laborRate ?? null,
      crew: parsed.data.crew ?? 1,
      techPauseDays: parsed.data.techPauseDays ?? null,
      description: parsed.data.description ?? null,
      category: parsed.data.category || "other",
    },
  });
  revalidatePath("/katalog/ukony");
  return { ok: true };
}

export async function updateOperation(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const id = String(formData.get("id"));
  const parsed = parseOperation(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  const fErr = checkFormulas(parsed.data.quantityFormula, parsed.data.laborFormula);
  if (fErr) return { error: fErr };

  const existing = await prisma.operation.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { error: "Úkon nenalezen." };

  const dup = await prisma.operation.findFirst({
    where: { code: parsed.data.code, NOT: { id } },
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
      laborRate: parsed.data.laborRate ?? null,
      crew: parsed.data.crew ?? 1,
      techPauseDays: parsed.data.techPauseDays ?? null,
      description: parsed.data.description ?? null,
      category: parsed.data.category || "other",
    },
  });
  revalidatePath("/katalog/ukony");
  revalidatePath(`/katalog/ukony/${id}`);
  return { ok: true };
}

export async function deleteOperation(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  await prisma.operation.deleteMany({ where: { id } });
  revalidatePath("/katalog/ukony");
  redirect("/katalog/ukony");
}

/** Ověří, že úkon existuje (katalog je sdílený). */
async function ownedOperation(id: string) {
  const op = await prisma.operation.findUnique({ where: { id }, select: { id: true } });
  return op?.id ?? null;
}

// ---------------------------------------------------------------------------
// Parametry úkonu
// ---------------------------------------------------------------------------

const PARAM_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function addParam(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const operationId = String(formData.get("operationId"));
  if (!(await ownedOperation(operationId))) return { error: "Úkon nenalezen." };

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
  await requireUser();
  const id = String(formData.get("id"));
  const param = await prisma.operationParam.findUnique({
    where: { id },
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
  await requireUser();
  const operationId = String(formData.get("operationId"));
  if (!(await ownedOperation(operationId))) return { error: "Úkon nenalezen." };

  const materialId = String(formData.get("materialId") || "");
  const material = await prisma.material.findUnique({ where: { id: materialId }, select: { id: true } });
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
  await requireUser();
  const id = String(formData.get("id"));
  const row = await prisma.operationMaterial.findUnique({
    where: { id },
    select: { id: true, operationId: true },
  });
  if (!row) return { error: "Řádek receptu nenalezen." };

  const materialId = String(formData.get("materialId") || "");
  const material = await prisma.material.findUnique({ where: { id: materialId }, select: { id: true } });
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
  await requireUser();
  const id = String(formData.get("id"));
  const row = await prisma.operationMaterial.findUnique({
    where: { id },
    select: { operationId: true },
  });
  if (!row) return;
  await prisma.operationMaterial.delete({ where: { id } });
  revalidatePath(`/katalog/ukony/${row.operationId}`);
}

// ---------------------------------------------------------------------------
// Integrace do fází: generování úkolů + žádanek z katalogu
// ---------------------------------------------------------------------------

export type CalcOperationDTO = Omit<CalcOperation, "id"> & {
  id: string;
  code: string;
  crew: number;
  paramsMeta: { key: string; label: string; unit: string | null; defaultValue: number | null }[];
};

/** Vrátí katalog úkonů ve formě pro klientskou kalkulačku/dialog. */
export async function listOperationsForCalc(): Promise<CalcOperationDTO[]> {
  await requireUser();
  const ops = await prisma.operation.findMany({
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
    crew: o.crew && o.crew > 0 ? o.crew : 1,
    quantityFormula: o.quantityFormula,
    laborFormula: o.laborFormula,
    laborRate: o.laborRate != null ? Number(o.laborRate) : null,
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
// Odhad dní z normohodin a počtu lidí v partě (crew). 1 člověk = 8 h/den.
function daysFromHours(hours: number, crew: number | null | undefined): number | null {
  const cr = crew && crew > 0 ? crew : 1;
  return hours > 0 ? Math.max(1, Math.ceil(hours / (HOURS_PER_DAY * cr))) : null;
}

export type GenerateInput = {
  projectId: string;
  subProjectId?: string | null;
  phaseId?: string | null; // přidat do existující fáze; jinak vznikne nová
  phaseName?: string;
  dependsOnPhaseId?: string | null; // nová fáze navazuje na tuto fázi
  phaseStartDate?: string | null; // ruční začátek fáze (YYYY-MM-DD); jen odsune, neuspíší
  // true = materiál seskupit pod samostatný úkol „Nákup: …" (žádanky = checklist),
  // jinak žádanky visí přímo na pracovním úkolu.
  materialAsTask?: boolean;
  lines: { operationId: string; values: Record<string, number>; multiplier?: number }[];
};

/** Z vybraných úkonů katalogu vytvoří fázi s dílčími úkoly (pracnost→dny)
 *  a žádankami na materiál (stav Poptávka, mimo forecast). */
export async function generateFromCatalog(
  input: GenerateInput,
): Promise<{ ok: true; phaseId: string } | { error: string }> {
  const user = await requireUser();
  const access = await getProjectAccess(input.projectId, user);
  if (!access || !canWrite(access.role)) {
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
    where: { id: { in: opIds } },
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
        startDate: input.phaseStartDate ? new Date(input.phaseStartDate) : null,
        createdById: user.id,
      },
    });
    phaseId = phase.id;

    // Návaznost na předchozí fázi (musí být fáze ve stejném projektu).
    const predId = input.dependsOnPhaseId || null;
    if (predId && predId !== phaseId) {
      const pred = await prisma.task.findFirst({
        where: { id: predId, projectId: input.projectId, kind: "phase" },
        select: { id: true },
      });
      if (pred) {
        await prisma.taskDependency.create({
          data: { taskId: phaseId, dependsOnId: pred.id },
        });
      }
    }
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
      laborRate: op.laborRate != null ? Number(op.laborRate) : null,
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
    const estimateDays = daysFromHours(res.laborHours, op.crew);

    const matRows = res.materials.filter((m) => m.quantity > 0);

    // Nákup materiálu jako samostatný úkol „Nákup: …" (checklist) – vytváříme HO
    // PRVNÍ, ať v rozvrhu PŘEDCHÁZÍ pracovní úkol (materiál se kupuje před prací).
    let materialTaskId: string | null = null;
    if (input.materialAsTask && matRows.length) {
      const matTotal = matRows.reduce((s, m) => s + m.cost, 0);
      const nakup = await prisma.task.create({
        data: {
          projectId: input.projectId,
          subProjectId,
          parentId: phaseId,
          kind: "task",
          title: `Nákup: ${op.name}`,
          description: `Nákup materiálu z katalogu (odhad ${Math.round(matTotal).toLocaleString("cs-CZ")} Kč). Položky níže = checklist objednání.`,
          status: "todo",
          createdById: user.id,
        },
      });
      materialTaskId = nakup.id;
    }

    // Pracovní úkol (vznikne po nákupu → v rozvrhu navazuje za ním).
    const subtask = await prisma.task.create({
      data: {
        projectId: input.projectId,
        subProjectId,
        parentId: phaseId,
        kind: "task",
        title: op.name,
        status: "todo",
        estimateDays,
        operationId: line.operationId,
        operationParams: JSON.stringify({ values: line.values || {}, multiplier: line.multiplier ?? 1 }),
        createdById: user.id,
      },
    });
    if (!materialTaskId) materialTaskId = subtask.id;

    for (const mat of matRows) {
      await prisma.request.create({
        data: {
          projectId: input.projectId,
          subProjectId,
          taskId: materialTaskId,
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

    // Položka práce (cena = normohodiny × sazba) → také do forecastu.
    if (res.laborCost > 0) {
      await prisma.request.create({
        data: {
          projectId: input.projectId,
          subProjectId,
          taskId: subtask.id,
          title: `Práce: ${op.name}`,
          quantity: res.laborHours,
          unit: "Nh",
          price: res.laborCost,
          category: "prace",
          status: "poptavka",
          createdById: user.id,
        },
      });
    }

    // Technologická pauza (zrání/tvrdnutí) → samostatný úkol hned za činností.
    // Nemá žádanky ani cenu, jen drží čas, než se smí navázat.
    const pause = op.techPauseDays ?? 0;
    if (pause > 0) {
      const dni = pause === 1 ? "den" : pause < 5 ? "dny" : "dní";
      await prisma.task.create({
        data: {
          projectId: input.projectId,
          subProjectId,
          parentId: phaseId,
          kind: "task",
          title: `⏳ Technologická pauza – zrání (${pause} ${dni})`,
          status: "todo",
          estimateDays: pause,
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

// ---------------------------------------------------------------------------
// CSV import katalogu (materials.csv, tasks.csv, task_materials.csv)
// Oddělovač ';', UTF-8, desetinná tečka; řádky '#' = oddělovač kategorií.
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ";") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type CsvRow = { comment?: string; fields?: string[] };

function parseCsv(text: string): { header: string[]; rows: CsvRow[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let header: string[] = [];
  const rows: CsvRow[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      rows.push({ comment: line.replace(/^#+\s*/, "").trim() });
      continue;
    }
    const fields = splitCsvLine(line);
    if (!header.length) {
      header = fields.map((f) => f.toLowerCase());
      continue;
    }
    rows.push({ fields });
  }
  return { header, rows };
}

function colIndex(header: string[], ...names: string[]): number {
  for (const n of names) {
    const i = header.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function num(s: string | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type ImportSummary = {
  materials: number;
  operations: number;
  recipes: number;
  packages: number;
  packageItems: number;
  warnings: string[];
};

export type ImportState = { error?: string; summary?: ImportSummary } | undefined;

export async function importCatalog(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser();
  const fMat = formData.get("materials");
  const fTasks = formData.get("tasks");
  const fTm = formData.get("taskMaterials");
  const fPkg = formData.get("packages");
  const fPkgItems = formData.get("packageItems");
  const matText = fMat instanceof File && fMat.size ? await fMat.text() : null;
  const taskText = fTasks instanceof File && fTasks.size ? await fTasks.text() : null;
  const tmText = fTm instanceof File && fTm.size ? await fTm.text() : null;
  const pkgText = fPkg instanceof File && fPkg.size ? await fPkg.text() : null;
  const pkgItemsText = fPkgItems instanceof File && fPkgItems.size ? await fPkgItems.text() : null;

  if (!matText && !taskText && !tmText && !pkgText && !pkgItemsText) {
    return { error: "Nahraj alespoň jeden CSV soubor." };
  }

  const warnings: string[] = [];
  let packages = 0;
  let packageItems = 0;
  let materials = 0;
  let operations = 0;
  let recipes = 0;

  // --- Materiály ---
  if (matText) {
    const { header, rows } = parseCsv(matText);
    const ci = {
      code: colIndex(header, "code", "kod", "kód"),
      name: colIndex(header, "name", "nazev", "název"),
      unit: colIndex(header, "unit_code", "unit", "mj"),
      weight: colIndex(header, "weight_per_unit"),
      price: colIndex(header, "price", "cena"),
      supplier: colIndex(header, "supplier", "zdroj"),
      updated: colIndex(header, "price_updated"),
      note: colIndex(header, "note", "poznamka", "poznámka"),
    };
    let category = "other";
    for (const r of rows) {
      if (r.comment) {
        category = r.comment;
        continue;
      }
      const f = r.fields!;
      const code = f[ci.code]?.trim();
      const name = f[ci.name]?.trim();
      if (!code || !name) {
        warnings.push(`Materiál bez kódu/názvu přeskočen: ${f.join(";")}`);
        continue;
      }
      const weight = ci.weight >= 0 ? num(f[ci.weight]) : null;
      const baseNote = ci.note >= 0 ? f[ci.note]?.trim() || "" : "";
      const note =
        [baseNote, weight != null ? `hmotnost ${weight}/MJ` : ""].filter(Boolean).join(" · ") || null;
      const data = {
        name,
        unit: (ci.unit >= 0 ? f[ci.unit]?.trim() : "") || "ks",
        unitPrice: num(f[ci.price]) ?? 0,
        priceSource: ci.supplier >= 0 ? f[ci.supplier]?.trim() || null : null,
        priceDate: ci.updated >= 0 ? toDate(f[ci.updated]) : null,
        category,
        note,
      };
      await prisma.material.upsert({
        where: { code },
        create: { ownerId: user.id, code, ...data },
        update: data,
      });
      materials++;
    }
  }

  // --- Úkony --- (zapamatuj unit + course_height pro stavbu receptu)
  const taskMeta = new Map<string, { unit: string; courseHeight: number | null }>();
  if (taskText) {
    const { header, rows } = parseCsv(taskText);
    const ci = {
      code: colIndex(header, "code", "kod", "kód"),
      name: colIndex(header, "name", "nazev", "název"),
      unit: colIndex(header, "unit_code", "unit", "mj"),
      labor: colIndex(header, "labor_hours", "normohodiny"),
      rate: colIndex(header, "labor_rate", "sazba"),
      course: colIndex(header, "course_height"),
      note: colIndex(header, "note", "poznamka", "poznámka"),
    };
    let category = "other";
    for (const r of rows) {
      if (r.comment) {
        category = r.comment;
        continue;
      }
      const f = r.fields!;
      const code = f[ci.code]?.trim();
      const name = f[ci.name]?.trim();
      if (!code || !name) {
        warnings.push(`Úkon bez kódu/názvu přeskočen: ${f.join(";")}`);
        continue;
      }
      const unit = (ci.unit >= 0 ? f[ci.unit]?.trim() : "") || "m2";
      const labor = num(f[ci.labor]) ?? 0;
      const rate = ci.rate >= 0 ? num(f[ci.rate]) : null;
      const courseHeight = ci.course >= 0 ? num(f[ci.course]) : null;
      taskMeta.set(code, { unit, courseHeight });
      const data = {
        name,
        unit,
        quantityFormula: "mnozstvi",
        laborFormula: labor > 0 ? `${labor} * mnozstvi` : "0",
        laborRate: rate,
        description: ci.note >= 0 ? f[ci.note]?.trim() || null : null,
        category,
      };
      const op = await prisma.operation.upsert({
        where: { code },
        create: { ownerId: user.id, code, ...data },
        update: data,
      });
      operations++;
      const hasMn = await prisma.operationParam.findFirst({
        where: { operationId: op.id, key: "mnozstvi" },
        select: { id: true },
      });
      if (!hasMn) {
        await prisma.operationParam.create({
          data: { operationId: op.id, key: "mnozstvi", label: "Množství", unit, sort: 0 },
        });
      }
    }
  }

  // --- Recepty --- (přestaví parametry i recept dotčených úkonů)
  if (tmText) {
    const { header, rows } = parseCsv(tmText);
    const ci = {
      task: colIndex(header, "task_code", "task", "ukon"),
      material: colIndex(header, "material_code", "material"),
      consumption: colIndex(header, "consumption", "spotreba", "spotřeba"),
      basis: colIndex(header, "consumption_basis", "basis"),
      waste: colIndex(header, "waste_factor", "prorez", "prořez"),
      note: colIndex(header, "note", "poznamka", "poznámka"),
    };
    const byTask = new Map<string, string[][]>();
    for (const r of rows) {
      if (r.comment) continue;
      const f = r.fields!;
      const tc = f[ci.task]?.trim();
      if (!tc) continue;
      const arr = byTask.get(tc) ?? [];
      arr.push(f);
      byTask.set(tc, arr);
    }

    for (const [taskCode, lines] of byTask) {
      const op = await prisma.operation.findFirst({
        where: { code: taskCode },
        select: { id: true, unit: true },
      });
      if (!op) {
        warnings.push(`Recept: úkon „${taskCode}" neexistuje – přeskočen.`);
        continue;
      }
      const courseHeight = taskMeta.get(taskCode)?.courseHeight ?? null;
      const needBaseLen = lines.some((f) => (f[ci.basis] || "").toUpperCase() === "BASE_LENGTH");
      const needCourse = lines.some((f) => (f[ci.basis] || "").toUpperCase() === "PER_COURSE");

      await prisma.operationParam.deleteMany({ where: { operationId: op.id } });
      await prisma.operationParam.create({ data: { operationId: op.id, key: "mnozstvi", label: "Množství", unit: op.unit, sort: 0 } });
      if (needBaseLen)
        await prisma.operationParam.create({ data: { operationId: op.id, key: "delka_radu", label: "Délka spodní řady", unit: "bm", sort: 1 } });
      if (needCourse)
        await prisma.operationParam.create({ data: { operationId: op.id, key: "vyska", label: "Výška", unit: "m", sort: 2 } });

      await prisma.operationMaterial.deleteMany({ where: { operationId: op.id } });
      for (const f of lines) {
        const matCode = f[ci.material]?.trim();
        const material = matCode
          ? await prisma.material.findFirst({ where: { code: matCode }, select: { id: true } })
          : null;
        if (!material) {
          warnings.push(`Recept ${taskCode}: materiál „${matCode}" neexistuje – řádek přeskočen.`);
          continue;
        }
        const consumption = num(f[ci.consumption]) ?? 0;
        const basis = (f[ci.basis] || "AREA").toUpperCase();
        const wf = ci.waste >= 0 ? num(f[ci.waste]) : null;
        const wastePct = wf != null && wf !== 1 ? Math.round((wf - 1) * 10000) / 100 : null;

        let formula: string;
        if (basis === "BASE_LENGTH") formula = `${consumption} * delka_radu`;
        else if (basis === "PER_COURSE") {
          if (courseHeight && courseHeight > 0) formula = `${consumption} * ceil(vyska / ${courseHeight})`;
          else {
            formula = `${consumption} * mnozstvi`;
            warnings.push(`Recept ${taskCode}: PER_COURSE bez výšky řady – použito množství.`);
          }
        } else formula = `${consumption} * mnozstvi`; // AREA, FIXED

        await prisma.operationMaterial.create({
          data: {
            operationId: op.id,
            materialId: material.id,
            quantityFormula: formula,
            wastePct,
            note: ci.note >= 0 ? f[ci.note]?.trim() || null : null,
          },
        });
        recipes++;
      }
    }
  }

  // --- Balíčky ---
  if (pkgText) {
    const { header, rows } = parseCsv(pkgText);
    const ci = {
      code: colIndex(header, "code", "kod", "kód"),
      name: colIndex(header, "name", "nazev", "název"),
      unit: colIndex(header, "unit_code", "unit", "mj"),
      note: colIndex(header, "note", "poznamka", "poznámka"),
    };
    for (const r of rows) {
      if (r.comment) continue;
      const f = r.fields!;
      const code = f[ci.code]?.trim();
      const name = f[ci.name]?.trim();
      if (!code || !name) {
        warnings.push(`Balíček bez kódu/názvu přeskočen: ${f.join(";")}`);
        continue;
      }
      const data = {
        name,
        unit: (ci.unit >= 0 ? f[ci.unit]?.trim() : "") || "m2",
        note: ci.note >= 0 ? f[ci.note]?.trim() || null : null,
      };
      await prisma.package.upsert({
        where: { code },
        create: { ownerId: user.id, code, ...data },
        update: data,
      });
      packages++;
    }
  }

  // --- Položky balíčků --- (přestaví obsah dotčených balíčků)
  if (pkgItemsText) {
    const { header, rows } = parseCsv(pkgItemsText);
    const ci = {
      pkg: colIndex(header, "package_code", "package", "balicek"),
      task: colIndex(header, "task_code", "task", "ukon"),
      qty: colIndex(header, "qty_per_unit", "qty", "mnozstvi"),
      note: colIndex(header, "note", "poznamka", "poznámka"),
    };
    const byPkg = new Map<string, string[][]>();
    for (const r of rows) {
      if (r.comment) continue;
      const f = r.fields!;
      const pc = f[ci.pkg]?.trim();
      if (!pc) continue;
      const arr = byPkg.get(pc) ?? [];
      arr.push(f);
      byPkg.set(pc, arr);
    }
    for (const [pkgCode, lines] of byPkg) {
      const pkg = await prisma.package.findFirst({ where: { code: pkgCode }, select: { id: true } });
      if (!pkg) {
        warnings.push(`Balíček „${pkgCode}" neexistuje – položky přeskočeny.`);
        continue;
      }
      await prisma.packageItem.deleteMany({ where: { packageId: pkg.id } });
      for (const f of lines) {
        const taskCode = f[ci.task]?.trim();
        const op = taskCode
          ? await prisma.operation.findFirst({ where: { code: taskCode }, select: { id: true } })
          : null;
        if (!op) {
          warnings.push(`Balíček ${pkgCode}: úkon „${taskCode}" neexistuje – řádek přeskočen.`);
          continue;
        }
        await prisma.packageItem.create({
          data: {
            packageId: pkg.id,
            operationId: op.id,
            qtyPerUnit: num(f[ci.qty]) ?? 1,
            note: ci.note >= 0 ? f[ci.note]?.trim() || null : null,
          },
        });
        packageItems++;
      }
    }
  }

  revalidatePath("/katalog/materialy");
  revalidatePath("/katalog/ukony");
  return { summary: { materials, operations, recipes, packages, packageItems, warnings } };
}

/** Balíčky pro dialog – s položkami (operationId + qtyPerUnit). */
export async function listPackagesForCalc() {
  await requireUser();
  const pkgs = await prisma.package.findMany({
    orderBy: [{ name: "asc" }],
    include: { items: { select: { operationId: true, qtyPerUnit: true } } },
  });
  return pkgs.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    items: p.items.map((it) => ({ operationId: it.operationId, qtyPerUnit: Number(it.qtyPerUnit) })),
  }));
}

// ---------------------------------------------------------------------------
// Chybějící činnosti v katalogu (wishlist k doplnění)
// ---------------------------------------------------------------------------

export async function createCatalogWish(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Zadej, jaká činnost chybí." };
  await prisma.catalogWish.create({
    data: { ownerId: user.id, title, note: String(formData.get("note") || "").trim() || null },
  });
  revalidatePath("/katalog/chybejici");
  return { ok: true };
}

export async function deleteCatalogWish(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  await prisma.catalogWish.deleteMany({ where: { id } });
  revalidatePath("/katalog/chybejici");
}

export async function setCatalogWishDone(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const done = String(formData.get("done")) === "1";
  await prisma.catalogWish.updateMany({ where: { id }, data: { done } });
  revalidatePath("/katalog/chybejici");
}

// ---------------------------------------------------------------------------
// Naplnění existujícího úkolu z katalogu (odhad dní + žádanky)
// ---------------------------------------------------------------------------

export async function fillTaskFromCatalog(input: {
  taskId: string;
  operationId: string;
  values: Record<string, number>;
  multiplier?: number;
}): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { id: true, projectId: true, subProjectId: true, createdById: true },
  });
  if (!task) return { error: "Úkol nenalezen." };

  const access = await getProjectAccess(task.projectId, user);
  if (!access) return { error: "Nemáš přístup k projektu." };
  let canEdit = isManager(access.role) || task.createdById === user.id;
  if (!canEdit && access.role === "active") {
    if (!access.scopeSubIds) canEdit = true;
    else {
      const scope = await expandScope(task.projectId, access.scopeSubIds);
      canEdit = !!task.subProjectId && scope.has(task.subProjectId);
    }
  }
  if (!canEdit) return { error: "Tento úkol nemůžeš upravit." };

  const op = await prisma.operation.findUnique({
    where: { id: input.operationId },
    include: {
      params: { orderBy: { sort: "asc" } },
      materials: { include: { material: { select: { id: true, name: true, unit: true, unitPrice: true, category: true } } } },
    },
  });
  if (!op) return { error: "Úkon z katalogu nenalezen." };

  const catById = new Map<string, string>();
  for (const r of op.materials) catById.set(r.material.id, r.material.category);

  const calcOp: CalcOperation = {
    id: op.id,
    name: op.name,
    unit: op.unit,
    quantityFormula: op.quantityFormula,
    laborFormula: op.laborFormula,
    laborRate: op.laborRate != null ? Number(op.laborRate) : null,
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
  const res = calcOperation(calcOp, input.values || {}, input.multiplier ?? 1);
  const estimateDays = daysFromHours(res.laborHours, op.crew);

  await prisma.task.update({
    where: { id: task.id },
    data: {
      estimateDays,
      operationId: input.operationId,
      operationParams: JSON.stringify({ values: input.values || {}, multiplier: input.multiplier ?? 1 }),
    },
  });

  // Opakované vyplnění z katalogu: smaž předchozí nevyřízené žádanky (stav poptavka)
  // na tomto úkolu, ať se materiál/práce nezdvojí (a nenafoukne forecast).
  await prisma.request.deleteMany({ where: { taskId: task.id, status: "poptavka" } });

  for (const mat of res.materials) {
    if (mat.quantity <= 0) continue;
    await prisma.request.create({
      data: {
        projectId: task.projectId,
        subProjectId: task.subProjectId,
        taskId: task.id,
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
  if (res.laborCost > 0) {
    await prisma.request.create({
      data: {
        projectId: task.projectId,
        subProjectId: task.subProjectId,
        taskId: task.id,
        title: `Práce: ${op.name}`,
        quantity: res.laborHours,
        unit: "Nh",
        price: res.laborCost,
        category: "prace",
        status: "poptavka",
        createdById: user.id,
      },
    });
  }

  const fd = new FormData();
  fd.set("projectId", task.projectId);
  if (task.subProjectId) fd.set("subProjectId", task.subProjectId);
  await recomputeSchedule(fd);

  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/planning");
  return { ok: true };
}
