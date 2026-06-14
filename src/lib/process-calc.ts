// Výpočetní jádro Procesních tabulek: z úkonu (parametry + recept) a zadaných
// hodnot spočítá množství v MJ, normohodiny a spotřebu/cenu materiálu.
// Čistá logika nad evalFormula – bez DB, snadno testovatelné.

import { evalFormula } from "@/lib/formula";

export type CalcParam = { key: string; defaultValue?: number | null };

export type CalcRecipe = {
  materialId: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantityFormula: string;
  wastePct?: number | null;
};

export type CalcOperation = {
  id?: string;
  name?: string;
  unit: string;
  quantityFormula: string;
  laborFormula: string;
  laborRate?: number | null;
  params: CalcParam[];
  materials: CalcRecipe[];
};

export type MaterialResult = {
  materialId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  cost: number;
};

export type OperationResult = {
  quantity: number; // množství v MJ úkonu
  unit: string;
  laborHours: number;
  laborCost: number;
  materials: MaterialResult[];
  materialCost: number;
  totalCost: number; // materiál + práce
  errors: string[];
};

/** Sestaví hodnoty parametrů: zadané, jinak výchozí, jinak 0. */
function buildVars(
  params: CalcParam[],
  values: Record<string, number>,
): Record<string, number> {
  const vars: Record<string, number> = {};
  for (const p of params) {
    const v = values[p.key];
    vars[p.key] = Number.isFinite(v) ? v : Number(p.defaultValue ?? 0);
  }
  // Povolíme i hodnoty mimo deklarované parametry (např. odvozené vstupy).
  for (const [k, v] of Object.entries(values)) {
    if (!(k in vars) && Number.isFinite(v)) vars[k] = v;
  }
  return vars;
}

/** Spočítá jeden úkon pro dané hodnoty parametrů a počet opakování. */
export function calcOperation(
  op: CalcOperation,
  values: Record<string, number>,
  multiplier = 1,
): OperationResult {
  const errors: string[] = [];
  const vars = buildVars(op.params, values);
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

  const evalOr0 = (formula: string, label: string): number => {
    try {
      return evalFormula(formula, vars);
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : "chyba vzorce"}`);
      return 0;
    }
  };

  const quantity = evalOr0(op.quantityFormula, "Množství") * m;
  const laborHours = evalOr0(op.laborFormula, "Normohodiny") * m;

  const materials: MaterialResult[] = op.materials.map((r) => {
    let qty = evalOr0(r.quantityFormula, `Materiál ${r.name}`) * m;
    if (r.wastePct) qty *= 1 + Number(r.wastePct) / 100;
    const cost = qty * Number(r.unitPrice);
    return {
      materialId: r.materialId,
      name: r.name,
      unit: r.unit,
      quantity: qty,
      unitPrice: Number(r.unitPrice),
      cost,
    };
  });

  const materialCost = materials.reduce((s, x) => s + x.cost, 0);
  const laborCost = laborHours * Number(op.laborRate ?? 0);
  return {
    quantity,
    unit: op.unit,
    laborHours,
    laborCost,
    materials,
    materialCost,
    totalCost: materialCost + laborCost,
    errors,
  };
}

export type CalcLine = {
  op: CalcOperation;
  values: Record<string, number>;
  multiplier?: number;
};

export type CalcTotals = {
  laborHours: number;
  laborCost: number;
  materialCost: number;
  totalCost: number;
  byMaterial: MaterialResult[]; // sečteno přes všechny úkony podle materiálu
  perOperation: (OperationResult & { name?: string; id?: string })[];
  errors: string[];
};

/** Spočítá projekt/fázi složenou z více úkonů a sečte materiál i náklady. */
export function calcTotals(lines: CalcLine[]): CalcTotals {
  const perOperation = lines.map((l) => ({
    ...calcOperation(l.op, l.values, l.multiplier ?? 1),
    name: l.op.name,
    id: l.op.id,
  }));

  const byId = new Map<string, MaterialResult>();
  for (const r of perOperation) {
    for (const mat of r.materials) {
      const cur = byId.get(mat.materialId);
      if (cur) {
        cur.quantity += mat.quantity;
        cur.cost += mat.cost;
      } else {
        byId.set(mat.materialId, { ...mat });
      }
    }
  }

  const byMaterial = [...byId.values()].sort((a, b) => b.cost - a.cost);
  const laborCost = perOperation.reduce((s, r) => s + r.laborCost, 0);
  const materialCost = perOperation.reduce((s, r) => s + r.materialCost, 0);
  return {
    laborHours: perOperation.reduce((s, r) => s + r.laborHours, 0),
    laborCost,
    materialCost,
    totalCost: materialCost + laborCost,
    byMaterial,
    perOperation,
    errors: perOperation.flatMap((r) => r.errors),
  };
}
