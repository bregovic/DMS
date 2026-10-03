"use client";

import { useRouter } from "next/navigation";

/**
 * Filtry přehledu dokladů jako výběry. Řada čipů zabrala na telefonu dva
 * řádky a nedalo se v ní poznat, co je zapnuté.
 */
export function DocFilters({
  smer,
  typ,
  stav,
  typy,
  stavy,
  base,
}: {
  smer: string;
  typ: string;
  stav: string;
  typy: { value: string; label: string }[];
  stavy: { value: string; label: string }[];
  /** Adresa se zachovanými ostatními parametry; filtr se do ní dosadí. */
  base: (over: Record<string, string>) => string;
}) {
  const router = useRouter();
  const sel =
    "h-10 min-w-0 flex-1 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-800 focus-visible:border-stone-950 focus-visible:outline-none sm:h-9 sm:flex-none";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400 sm:flex-none">
        Směr
        <select value={smer} onChange={(e) => router.push(base({ smer: e.target.value }))} className={sel}>
          <option value="">Vše</option>
          <option value="in">Vstup (přijaté)</option>
          <option value="out">Výstup (vystavené)</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400 sm:flex-none">
        Typ
        <select value={typ} onChange={(e) => router.push(base({ typ: e.target.value }))} className={sel}>
          <option value="">Vše</option>
          {typy.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400 sm:flex-none">
        Stav
        <select value={stav} onChange={(e) => router.push(base({ stav: e.target.value }))} className={sel}>
          <option value="">Vše</option>
          {stavy.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
