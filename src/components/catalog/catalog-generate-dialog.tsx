"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Trash2, X } from "lucide-react";
import {
  listOperationsForCalc,
  listPackagesForCalc,
  generateFromCatalog,
  createCatalogWish,
  type CalcOperationDTO,
} from "@/server/actions/process-tables";

type PackageDTO = {
  id: string;
  code: string;
  name: string;
  unit: string;
  items: { operationId: string; qtyPerUnit: number }[];
};
import { calcOperation, calcTotals } from "@/lib/process-calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";
import { ParamField } from "@/components/catalog/param-field";
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
  phases = [],
  phase,
}: {
  projectId: string;
  subProjectId?: string | null;
  phases?: { id: string; title: string }[];
  phase?: { id: string; title: string }; // přidat do existující fáze
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState<CalcOperationDTO[] | null>(null);
  const [packages, setPackages] = useState<PackageDTO[]>([]);
  const [pkgSel, setPkgSel] = useState("");
  const [pkgQty, setPkgQty] = useState("1");
  const [phaseName, setPhaseName] = useState("");
  const [dependsOnPhaseId, setDependsOnPhaseId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wishText, setWishText] = useState("");
  const [wishSaved, setWishSaved] = useState(false);
  const counter = useRef(0);

  async function noteWish() {
    const t = wishText.trim();
    if (!t) return;
    const fd = new FormData();
    fd.set("title", t);
    await createCatalogWish(undefined, fd);
    setWishText("");
    setWishSaved(true);
  }

  useEffect(() => {
    if (open && ops === null) {
      listOperationsForCalc()
        .then(setOps)
        .catch(() => setError("Načtení katalogu selhalo."));
      listPackagesForCalc()
        .then(setPackages)
        .catch(() => {});
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
    if (!phase && !phaseName) setPhaseName(op.name ?? "");
  }

  function addPackage() {
    const pkg = packages.find((p) => p.id === pkgSel);
    if (!pkg) return;
    const qty = parseFloat(pkgQty.replace(",", ".")) || 0;
    if (qty <= 0) return;
    const newLines: Line[] = [];
    for (const it of pkg.items) {
      const op = opMap.get(it.operationId);
      if (!op) continue;
      const values: Record<string, number> = {};
      for (const p of op.paramsMeta) values[p.key] = Number(p.defaultValue ?? 0);
      values.mnozstvi = it.qtyPerUnit * qty;
      counter.current += 1;
      newLines.push({ lineId: counter.current, operationId: it.operationId, values, multiplier: 1 });
    }
    if (newLines.length) setLines((ls) => [...ls, ...newLines]);
    if (!phase && !phaseName) setPhaseName(`${pkg.name} (${qty} ${pkg.unit})`);
    setPkgSel("");
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
        phaseId: phase?.id ?? null,
        phaseName: phase ? undefined : phaseName,
        dependsOnPhaseId: phase ? null : dependsOnPhaseId || null,
        lines: lines.map((l) => ({ operationId: l.operationId, values: l.values, multiplier: l.multiplier })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        setOpen(false);
        setLines([]);
        setPhaseName("");
        setDependsOnPhaseId("");
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
    return phase ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Přidat do fáze z katalogu"
        className="inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline cursor-pointer"
      >
        <Boxes className="size-3.5" />
        Z katalogu
      </button>
    ) : (
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
          <h3 className="kicker">
            {phase ? `Přidat do fáze · ${phase.title}` : "Nová fáze z katalogu"}
          </h3>
          <button type="button" onClick={close} className="text-stone-400 hover:text-stone-950 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {!phase && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cg-phase">Název fáze</Label>
              <Input id="cg-phase" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} placeholder="Např. Hrubá stavba 1.NP" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cg-dep">Navazuje na fázi (volitelné)</Label>
              <select
                id="cg-dep"
                className={fieldClass}
                value={dependsOnPhaseId}
                onChange={(e) => setDependsOnPhaseId(e.target.value)}
              >
                <option value="">— bez návaznosti —</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          )}

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

          {packages.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cg-pkg">Nebo přidat balíček „na klíč"</Label>
              <div className="flex items-end gap-2">
                <select
                  id="cg-pkg"
                  className={fieldClass + " flex-1"}
                  value={pkgSel}
                  onChange={(e) => setPkgSel(e.target.value)}
                >
                  <option value="">— vyber balíček —</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
                <div className="w-24 space-y-1">
                  <Label htmlFor="cg-pkg-qty">Množství</Label>
                  <Input
                    id="cg-pkg-qty"
                    type="number"
                    step="any"
                    min="0"
                    value={pkgQty}
                    onChange={(e) => setPkgQty(e.target.value)}
                  />
                </div>
                <Button type="button" variant="outline" disabled={!pkgSel} onClick={addPackage}>
                  Rozbalit
                </Button>
              </div>
              <p className="text-[11px] text-stone-400">
                Balíček přidá své úkony s množstvím = poměr × zadané množství; dál se dají
                upravit.
              </p>
            </div>
          )}

          <div className="space-y-1.5 border border-dashed border-stone-300 p-3">
            <Label htmlFor="cg-wish">Nenašel jsi činnost? Zapiš si ji k doplnění</Label>
            <div className="flex items-end gap-2">
              <Input
                id="cg-wish"
                value={wishText}
                onChange={(e) => {
                  setWishText(e.target.value);
                  setWishSaved(false);
                }}
                placeholder="Např. Montáž sádrokartonového podhledu"
              />
              <Button type="button" variant="outline" disabled={!wishText.trim()} onClick={noteWish}>
                Zapsat
              </Button>
            </div>
            {wishSaved && (
              <p className="text-[11px] text-stone-500">
                Uloženo do Katalog → Chybějící. Tam stáhneš šablonu s promptem pro AI.
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {op.paramsMeta.map((p) => (
                    <ParamField
                      key={p.key}
                      idBase={`l${l.lineId}-${p.key}`}
                      label={p.label}
                      unit={p.unit}
                      value={l.values[p.key]}
                      onChange={(v) =>
                        setLines((ls) =>
                          ls.map((x) =>
                            x.lineId === l.lineId
                              ? { ...x, values: { ...x.values, [p.key]: v } }
                              : x,
                          ),
                        )
                      }
                    />
                  ))}
                  <div className="space-y-1">
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
            {phase
              ? "Přidá do fáze dílčí úkoly (pracnost → dny, 8 h/den) a žádanky na materiál i práci; termíny se přepočítají."
              : "Vytvoří fázi s dílčími úkoly (pracnost → dny, 8 h/den) a žádankami na materiál i práci (Poptávka) – rovnou se počítají ve forecastu."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Zrušit
            </Button>
            <Button type="button" disabled={pending || lines.length === 0} onClick={submit}>
              {pending ? "Generuji…" : phase ? "Přidat do fáze" : "Vytvořit fázi"}
            </Button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
