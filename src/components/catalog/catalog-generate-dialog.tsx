"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Trash2, X } from "lucide-react";
import {
  listOperationsForCalc,
  generateFromCatalog,
  type CalcOperationDTO,
} from "@/server/actions/process-tables";
import { calcOperation, calcTotals } from "@/lib/process-calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";
import { formatCurrency } from "@/lib/utils";

type Line = {
  lineId: number;
  operationId: string;
  values: Record<string, number>;
  multiplier: number;
};

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function CatalogGenerateDialog({
  projectId,
  subProjectId,
}: {
  projectId: string;
  subProjectId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState<CalcOperationDTO[] | null>(null);
  const [phaseName, setPhaseName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (open && ops === null) {
      listOperationsForCalc()
        .then(setOps)
        .catch(() => setError("Načtení katalogu selhalo."));
    }
  }, [open, ops]);

  const opMap = new Map((ops ?? []).map((o) => [o.id, o]));

  function addLine(operationId: string) {
    const op = opMap.get(operationId);
    if (!op) return;
    const values: Record<string, number> = {};
    for (const p of op.paramsMeta) values[p.key] = Number(p.defaultValue ?? 0);
    counter.current += 1;
    setLines((ls) => [...ls, { lineId: counter.current, operationId, values, multiplier: 1 }]);
    if (!phaseName) setPhaseName(op.name ?? "");
  }

  function close() {
    setOpen(false);
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await generateFromCatalog({
        projectId,
        subProjectId: subProjectId ?? null,
        phaseName,
        lines: lines.map((l) => ({ operationId: l.operationId, values: l.values, multiplier: l.multiplier })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        setOpen(false);
        setLines([]);
        setPhaseName("");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generování selhalo.");
    }
    setPending(false);
  }

  // Souhrn přes všechny řádky.
  const totals =
    ops && lines.length
      ? calcTotals(
          lines
            .map((l) => {
              const op = opMap.get(l.operationId);
              return op ? { op, values: l.values, multiplier: l.multiplier } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null),
        )
      : null;

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Boxes className="size-4" />
        Z katalogu
      </Button>
    );
  }

  return (
    <ModalBackdrop onClose={close}>
      <div className="w-full max-w-2xl border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nová fáze z katalogu</h3>
          <button type="button" onClick={close} className="text-stone-400 hover:text-stone-950 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <Label htmlFor="cg-phase">Název fáze</Label>
            <Input id="cg-phase" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} placeholder="Např. Hrubá stavba 1.NP" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cg-add">Přidat činnost</Label>
            <select
              id="cg-add"
              className={fieldClass}
              value=""
              onChange={(e) => {
                if (e.target.value) addLine(e.target.value);
                e.target.value = "";
              }}
              disabled={!ops}
            >
              <option value="">{ops ? "— vyber úkon z katalogu —" : "Načítám katalog…"}</option>
              {(ops ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.unit})
                </option>
              ))}
            </select>
            {ops && ops.length === 0 && (
              <p className="text-[11px] text-stone-400">
                Katalog je prázdný – přidej nejdřív úkony v Katalogu.
              </p>
            )}
          </div>

          {lines.map((l) => {
            const op = opMap.get(l.operationId);
            if (!op) return null;
            const res = calcOperation(op, l.values, l.multiplier);
            return (
              <div key={l.lineId} className="space-y-3 border border-stone-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-stone-950">{op.name}</p>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.lineId !== l.lineId))}
                    className="text-stone-400 hover:text-red-600 cursor-pointer"
                    title="Odebrat"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {op.paramsMeta.map((p) => (
                    <div key={p.key} className="w-28 space-y-1">
                      <Label htmlFor={`l${l.lineId}-${p.key}`}>
                        {p.label}
                        {p.unit ? ` (${p.unit})` : ""}
                      </Label>
                      <Input
                        id={`l${l.lineId}-${p.key}`}
                        type="number"
                        step="any"
                        value={Number.isFinite(l.values[p.key]) ? l.values[p.key] : 0}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((x) =>
                              x.lineId === l.lineId
                                ? { ...x, values: { ...x.values, [p.key]: parseFloat(e.target.value) || 0 } }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <div className="w-20 space-y-1">
                    <Label htmlFor={`l${l.lineId}-mult`}>Počet</Label>
                    <Input
                      id={`l${l.lineId}-mult`}
                      type="number"
                      step="1"
                      min="1"
                      value={l.multiplier}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((x) =>
                            x.lineId === l.lineId ? { ...x, multiplier: parseInt(e.target.value) || 1 } : x,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-stone-500">
                  {res.quantity.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} {op.unit} ·{" "}
                  {res.laborHours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} Nh (≈{" "}
                  {Math.max(1, Math.ceil(res.laborHours / 8))} d) · materiál {formatCurrency(res.materialCost)}
                  {res.errors.length > 0 && <span className="text-red-600"> · {res.errors.join(", ")}</span>}
                </p>
              </div>
            );
          })}

          {totals && (
            <div className="border-t border-stone-300 pt-3 text-sm">
              <p className="kicker mb-2">Souhrn fáze</p>
              <div className="flex flex-wrap gap-x-8 gap-y-1">
                <span>
                  Pracnost:{" "}
                  <span className="font-mono text-stone-950">
                    {totals.laborHours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} Nh
                  </span>
                </span>
                <span>
                  Materiál:{" "}
                  <span className="font-mono text-stone-950">{formatCurrency(totals.materialCost)}</span>
                </span>
                <span>
                  Práce:{" "}
                  <span className="font-mono text-stone-950">{formatCurrency(totals.laborCost)}</span>
                </span>
                <span>
                  Celkem:{" "}
                  <span className="font-mono text-stone-950">{formatCurrency(totals.totalCost)}</span>
                </span>
                <span className="text-stone-500">{lines.length} dílčích úkolů</span>
              </div>
            </div>
          )}

          {error && (
            <p className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-5 py-4">
          <p className="text-[11px] text-stone-400">
            Vytvoří fázi s dílčími úkoly (pracnost → dny, 8 h/den) a žádankami na materiál ve stavu Poptávka.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Zrušit
            </Button>
            <Button type="button" disabled={pending || lines.length === 0} onClick={submit}>
              {pending ? "Generuji…" : "Vytvořit fázi"}
            </Button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
