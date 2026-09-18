"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { proposeCatalogOperation, saveCatalogProposal } from "@/server/actions/process-tables";
import type { CatalogProposal } from "@/server/catalog-ai";
import { calcOperation } from "@/lib/process-calc";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

/**
 * Návrh chybějícího úkonu přes AI (#35) – z názvu činnosti AI navrhne úkon
 * s normou práce a recepturou materiálů s cenami dohledanými na webu.
 * Po kontrole se uloží do katalogu a rovnou přidá do rozpisu.
 */
export function CatalogAiProposal({ title, onSaved }: { title: string; onSaved: (operationId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [p, setP] = useState<CatalogProposal | null>(null);

  async function propose() {
    setBusy(true);
    setErr(null);
    try {
      setP(await proposeCatalogOperation(title, note));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Návrh se nepodařil.");
    }
    setBusy(false);
  }

  if (!p)
    return (
      <div className="space-y-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Upřesnění (volitelné) – např. EPS 160 mm, silikonová omítka"
          className="flex h-9 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
        />
        <Button type="button" variant="outline" size="sm" disabled={busy || title.trim().length < 3} onClick={propose}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {busy ? "AI hledá normy a ceny… (do minuty)" : "Navrhnout úkon přes AI"}
        </Button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    );

  // Kolik vyjde 1 MJ podle návrhu
  const vars = Object.fromEntries(p.params.map((x) => [x.key, 1]));
  const one = calcOperation(
    {
      unit: p.operation.unit,
      quantityFormula: p.operation.quantityFormula,
      laborFormula: p.operation.laborFormula,
      laborRate: p.operation.laborRate,
      params: p.params.map((x) => ({ key: x.key, defaultValue: 1 })),
      materials: p.materials.map((m, i) => ({
        materialId: String(i),
        name: m.name,
        unit: m.unit,
        unitPrice: m.unitPrice,
        quantityFormula: m.quantityFormula,
        wastePct: m.wastePct,
      })),
    },
    vars,
  );

  return (
    <div className="space-y-2 border border-orange-200 bg-orange-50/50 p-3 text-sm">
      <p className="font-medium text-stone-950">
        {p.operation.name} <span className="text-xs font-normal text-stone-500">({p.operation.code} · {p.operation.unit})</span>
      </p>
      <p className="text-xs text-stone-700">{p.summary}</p>
      <p className="text-xs text-stone-600">
        Práce: {p.operation.laborFormula} Nh × {formatCurrency(p.operation.laborRate)}/h · parta {p.operation.crew}
        {p.operation.techPauseDays ? ` · pauza ${p.operation.techPauseDays} d` : ""} · za 1 {p.operation.unit}:{" "}
        <b>{formatCurrency(one.totalCost)}</b> (materiál {formatCurrency(one.materialCost)}, práce {formatCurrency(one.laborCost)})
      </p>
      {p.materials.length > 0 && (
        <ul className="space-y-0.5 text-xs text-stone-700">
          {p.materials.map((m, i) => (
            <li key={i}>
              • {m.name} – {m.quantityFormula} {m.unit} × {formatCurrency(m.unitPrice)}
              <span className="text-stone-400">
                {" "}
                · {m.existingCode ? `z katalogu (${m.existingCode})` : "nový"} · {m.priceSource}
              </span>
            </li>
          ))}
        </ul>
      )}
      {p.warnings.length > 0 && <p className="text-[11px] text-amber-800">⚠ {p.warnings.join(" · ")}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              onSaved(await saveCatalogProposal(p));
              setP(null);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Uložení se nepodařilo.");
            }
            setBusy(false);
          }}
        >
          Uložit do katalogu a přidat
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setP(null)}>
          Zahodit
        </Button>
      </div>
    </div>
  );
}
