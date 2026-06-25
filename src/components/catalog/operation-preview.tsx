"use client";

import { useMemo, useState } from "react";
import { calcOperation, type CalcOperation } from "@/lib/process-calc";
import { ParamField } from "@/components/catalog/param-field";
import { formatCurrency } from "@/lib/utils";

export type PreviewParam = { key: string; label: string; unit: string | null; defaultValue: number | null };

export function OperationPreview({
  operation,
  params,
}: {
  operation: CalcOperation;
  params: PreviewParam[];
}) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const v: Record<string, number> = {};
    for (const p of params) v[p.key] = Number(p.defaultValue ?? 0);
    return v;
  });

  const result = useMemo(() => calcOperation(operation, values), [operation, values]);

  if (params.length === 0) {
    return (
      <p className="text-sm text-stone-400">
        Přidej parametry, podle kterých se počítá množství, pracnost a spotřeba.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {params.map((p) => (
          <ParamField
            key={p.key}
            idBase={`pv-${p.key}`}
            label={p.label}
            unit={p.unit}
            value={values[p.key]}
            onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
          />
        ))}
      </div>

      {result.errors.length > 0 && (
        <p className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.errors.join(" · ")}
        </p>
      )}

      <div className="flex flex-wrap gap-8 border-y border-stone-200 py-3 text-sm">
        <div>
          <p className="kicker">Množství</p>
          <p className="font-mono text-stone-950">
            {result.quantity.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} {operation.unit}
          </p>
        </div>
        <div>
          <p className="kicker">Normohodiny</p>
          <p className="font-mono text-stone-950">
            {result.laborHours.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Nh
          </p>
        </div>
        <div>
          <p className="kicker">Materiál</p>
          <p className="font-mono text-stone-950">{formatCurrency(result.materialCost)}</p>
        </div>
        <div>
          <p className="kicker">Práce</p>
          <p className="font-mono text-stone-950">{formatCurrency(result.laborCost)}</p>
        </div>
        <div>
          <p className="kicker">Celkem</p>
          <p className="font-mono text-stone-950">{formatCurrency(result.totalCost)}</p>
        </div>
      </div>

      {result.materials.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="py-1.5 pr-4 font-normal kicker">Materiál</th>
              <th className="py-1.5 pr-4 text-right font-normal kicker">Množství</th>
              <th className="py-1.5 pr-4 text-right font-normal kicker">Cena/MJ</th>
              <th className="py-1.5 text-right font-normal kicker">Cena</th>
            </tr>
          </thead>
          <tbody>
            {result.materials.map((m) => (
              <tr key={m.materialId} className="border-b border-stone-100">
                <td className="py-1.5 pr-4 text-stone-800">{m.name}</td>
                <td className="py-1.5 pr-4 text-right font-mono text-stone-600">
                  {m.quantity.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} {m.unit}
                </td>
                <td className="py-1.5 pr-4 text-right font-mono text-stone-500">
                  {formatCurrency(m.unitPrice)}
                </td>
                <td className="py-1.5 text-right font-mono text-stone-950">
                  {formatCurrency(m.cost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
