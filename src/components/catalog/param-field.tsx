"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** Podle MJ parametru nabídne rozměry, jejichž součin se vloží do pole. */
function dimsFor(unit: string | null): { hint: string; dims: string[] } {
  const u = (unit || "").toLowerCase();
  if (u === "m2") return { hint: "plocha = délka × šířka", dims: ["Délka (m)", "Šířka / výška (m)"] };
  if (u === "m3") return { hint: "objem = délka × šířka × výška", dims: ["Délka (m)", "Šířka (m)", "Výška / hloubka (m)"] };
  if (u === "bm" || u === "m") return { hint: "délka", dims: ["Délka (m)"] };
  return { hint: "výsledek = součin zadaných hodnot", dims: ["Rozměr a", "Rozměr b", "Rozměr c"] };
}

const toNum = (s: string) => parseFloat((s || "").replace(",", "."));

export function ParamField({
  idBase,
  label,
  unit,
  value,
  onChange,
}: {
  idBase: string;
  label: string;
  unit: string | null;
  value: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<string[]>([]);
  const cfg = dimsFor(unit);

  const nums = cfg.dims.map((_, i) => toNum(dims[i] ?? ""));
  const filled = nums.filter((n) => Number.isFinite(n) && n > 0);
  const product = filled.length ? filled.reduce((a, b) => a * b, 1) : 0;
  const rounded = Math.round(product * 1000) / 1000;

  return (
    <div className="space-y-1">
      {/* Pevná výška popiskového řádku (i pro 2řádkové popisky), ať inputy
          parametrů sedí na stejné lince napříč mřížkou. */}
      <div className="flex min-h-9 items-center justify-between gap-1">
        <Label htmlFor={idBase}>
          {label}
          {unit ? ` (${unit})` : ""}
        </Label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Spočítat z rozměrů"
          className={`cursor-pointer ${open ? "text-stone-950" : "text-stone-400 hover:text-stone-950"}`}
        >
          <Calculator className="size-3.5" />
        </button>
      </div>
      <Input
        id={idBase}
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {open && (
        <div className="space-y-1.5 border border-stone-200 bg-stone-50 p-2">
          <p className="text-[11px] text-stone-500">{cfg.hint}</p>
          {cfg.dims.map((d, i) => (
            <Input
              key={i}
              type="number"
              step="any"
              placeholder={d}
              value={dims[i] ?? ""}
              onChange={(e) =>
                setDims((ds) => {
                  const next = [...ds];
                  next[i] = e.target.value;
                  return next;
                })
              }
            />
          ))}
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-stone-700">
              = {rounded.toLocaleString("cs-CZ", { maximumFractionDigits: 3 })}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={rounded <= 0}
              onClick={() => {
                onChange(rounded);
                setOpen(false);
              }}
            >
              Použít
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
