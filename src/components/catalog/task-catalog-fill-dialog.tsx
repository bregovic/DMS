"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, X } from "lucide-react";
import {
  listOperationsForCalc,
  fillTaskFromCatalog,
  type CalcOperationDTO,
} from "@/server/actions/process-tables";
import { calcOperation } from "@/lib/process-calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";
import { ParamField } from "@/components/catalog/param-field";
import { OperationPicker } from "@/components/catalog/operation-picker";
import { formatCurrency } from "@/lib/utils";

export function TaskCatalogFillDialog({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState<CalcOperationDTO[] | null>(null);
  const [opId, setOpId] = useState("");
  const [values, setValues] = useState<Record<string, number>>({});
  const [multiplier, setMultiplier] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && ops === null) {
      listOperationsForCalc()
        .then(setOps)
        .catch(() => setError("Načtení katalogu selhalo."));
    }
  }, [open, ops]);

  const op = (ops ?? []).find((o) => o.id === opId);

  function pick(id: string) {
    setOpId(id);
    const o = (ops ?? []).find((x) => x.id === id);
    const v: Record<string, number> = {};
    if (o) for (const p of o.paramsMeta) v[p.key] = Number(p.defaultValue ?? 0);
    setValues(v);
  }

  const res = op ? calcOperation(op, values, multiplier) : null;

  async function submit() {
    if (!op) return;
    setPending(true);
    setError(null);
    try {
      const r = await fillTaskFromCatalog({ taskId, operationId: opId, values, multiplier });
      if ("error" in r) setError(r.error);
      else {
        setOpen(false);
        setOpId("");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Naplnění selhalo.");
    }
    setPending(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Naplnit úkol z katalogu"
        className="inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline cursor-pointer"
      >
        <Boxes className="size-3.5" />
        Z katalogu
      </button>
    );
  }

  return (
    <ModalBackdrop onClose={() => setOpen(false)}>
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Naplnit úkol z katalogu · {taskTitle}</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-950 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <Label>Činnost z katalogu</Label>
            {op ? (
              <p className="flex items-center gap-2 text-sm text-stone-700">
                Vybráno: <span className="font-medium text-stone-950">{op.name}</span>
                <button
                  type="button"
                  onClick={() => setOpId("")}
                  className="text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline cursor-pointer"
                >
                  změnit
                </button>
              </p>
            ) : (
              <OperationPicker ops={ops} onPick={(o) => pick(o.id)} />
            )}
          </div>

          {op && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {op.paramsMeta.map((p) => (
                  <ParamField
                    key={p.key}
                    idBase={`tf-${p.key}`}
                    label={p.label}
                    unit={p.unit}
                    value={values[p.key]}
                    onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
                  />
                ))}
                <div className="space-y-1">
                  <Label htmlFor="tf-mult">Počet</Label>
                  <Input id="tf-mult" type="number" step="1" min="1" value={multiplier} onChange={(e) => setMultiplier(parseInt(e.target.value) || 1)} />
                </div>
              </div>

              {res && (
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-y border-stone-200 py-3 text-sm">
                  <span>Pracnost: <span className="font-mono text-stone-950">{res.laborHours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} Nh (≈ {Math.max(1, Math.ceil(res.laborHours / 8))} d)</span></span>
                  <span>Materiál: <span className="font-mono text-stone-950">{formatCurrency(res.materialCost)}</span></span>
                  <span>Práce: <span className="font-mono text-stone-950">{formatCurrency(res.laborCost)}</span></span>
                  {res.errors.length > 0 && <span className="text-red-600">{res.errors.join(", ")}</span>}
                </div>
              )}
            </>
          )}

          {error && <p className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-5 py-4">
          <p className="text-[11px] text-stone-400">
            Doplní úkolu odhad dní a přidá žádanky na materiál i práci (Poptávka).
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="button" disabled={pending || !op} onClick={submit}>
              {pending ? "Plním…" : "Naplnit úkol"}
            </Button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
