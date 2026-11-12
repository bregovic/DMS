"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useFormAction } from "@/components/ui/use-form-action";
import { saveTenderWeights } from "@/server/actions/tenders";

const field =
  "flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none";
const btn =
  "inline-flex h-9 items-center gap-1.5 bg-stone-950 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 cursor-pointer";
const ghost =
  "inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer";

export type Field = { label: string; unit: string | null; required: boolean };

/**
 * Údaje k vyplnění v nabídce: zaškrtávací seznam – vybrané údaje, návrhy
 * a vlastní doplněné. Výsledek jde do skrytého pole `offerFields` ve formátu,
 * který čte server (řádek = údaj, [jednotka], * = povinné).
 */
export function FieldPicker({ current, suggested }: { current: Field[]; suggested: Field[] }) {
  const key = (f: Field) => f.label.trim().toLowerCase();
  const [rows, setRows] = useState<(Field & { on: boolean; navrh: boolean })[]>(() => {
    const out = current.map((f) => ({ ...f, on: true, navrh: false }));
    for (const f of suggested) if (!out.some((o) => key(o) === key(f))) out.push({ ...f, on: false, navrh: true });
    return out;
  });
  const [novy, setNovy] = useState("");
  const [jednotka, setJednotka] = useState("");

  const text = rows
    .filter((r) => r.on)
    .map((r) => `${r.label}${r.unit ? ` [${r.unit}]` : ""}${r.required ? " *" : ""}`)
    .join("\n");

  function pridat() {
    const label = novy.trim();
    if (!label || rows.some((r) => key(r) === label.toLowerCase())) return;
    setRows([...rows, { label, unit: jednotka.trim() || null, required: false, on: true, navrh: false }]);
    setNovy("");
    setJednotka("");
  }

  return (
    <div>
      <input type="hidden" name="offerFields" value={text} />
      {rows.length > 0 && (
        <ul className="divide-y divide-stone-100 border border-stone-200">
          {rows.map((r, i) => (
            <li key={i} className={`flex items-center gap-3 px-3 py-2 ${r.on ? "" : "bg-stone-50/70"}`}>
              <input
                type="checkbox"
                checked={r.on}
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))}
                className="size-4 accent-stone-950"
                aria-label={r.label}
              />
              <span className={`min-w-0 flex-1 text-sm ${r.on ? "text-stone-900" : "text-stone-500"}`}>
                {r.label}
                {r.unit && <span className="text-stone-400"> [{r.unit}]</span>}
                {r.navrh && <span className="ml-2 text-[10px] uppercase tracking-wide text-stone-400">návrh</span>}
              </span>
              {r.on && (
                <label className="flex cursor-pointer items-center gap-1 text-xs text-stone-500">
                  <input
                    type="checkbox"
                    checked={r.required}
                    onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, required: e.target.checked } : x)))}
                    className="size-3.5 accent-stone-950"
                  />
                  povinné
                </label>
              )}
              {!r.navrh && (
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((_, k) => k !== i))}
                  aria-label="Odebrat"
                  className="flex size-7 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={novy}
          onChange={(e) => setNovy(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pridat();
            }
          }}
          placeholder="Další údaj"
          className={field}
        />
        <input
          value={jednotka}
          onChange={(e) => setJednotka(e.target.value)}
          placeholder="jednotka"
          className={`${field} max-w-28`}
        />
        <button type="button" onClick={pridat} className="inline-flex h-9 shrink-0 items-center gap-1 border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:border-stone-950 cursor-pointer">
          <Plus className="size-3.5" />
          Přidat
        </button>
      </div>
    </div>
  );
}

type State = { error?: string; ok?: boolean } | undefined;

/** Kritéria výběru s vahou v procentech – jen pro zadavatele. */
type Weight = { label: string; weight: number; note?: string };

export function WeightsEditor({
  tenderId,
  initial,
  fromSuggestion = false,
}: {
  tenderId: string;
  initial: Weight[];
  /** Předvyplněno z návrhu, zatím neuložené. */
  fromSuggestion?: boolean;
}) {
  const [rows, setRows] = useState<Weight[]>(initial.length ? initial : [{ label: "Cena", weight: 100, note: "" }]);
  const [state, action, pending] = useFormAction<State>(saveTenderWeights, undefined);
  const sum = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={tenderId} />
      <input type="hidden" name="weights" value={JSON.stringify(rows)} />
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input
              value={r.label}
              onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
              placeholder="Kritérium"
              className={`${field} sm:max-w-56`}
              aria-label="Kritérium"
            />
            <input
              value={r.note ?? ""}
              onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))}
              placeholder="parametr, např. realizace do 6 týdnů"
              className={field}
              aria-label="Parametr"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={r.weight}
              onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, weight: Number(e.target.value) } : x)))}
              className={`${field} w-20 text-right font-mono`}
              aria-label="Váha v procentech"
            />
            <span className="text-sm text-stone-500">%</span>
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, k) => k !== i))}
              aria-label="Odebrat"
              className="flex size-8 shrink-0 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows([...rows, { label: "", weight: 0, note: "" }])} className={ghost}>
          <Plus className="size-3.5" /> Kritérium
        </button>
        <span className={`text-xs ${sum === 100 ? "text-stone-500" : "text-amber-700"}`}>Součet {sum} %</span>
        <button type="submit" disabled={pending} className={btn}>
          Uložit
        </button>
        {state?.ok && !pending && <span className="text-xs text-stone-500">Uloženo</span>}
        {fromSuggestion && !state?.ok && <span className="text-xs text-amber-700">Podle návrhu – zatím neuloženo</span>}
        {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
