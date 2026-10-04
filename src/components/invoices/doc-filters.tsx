"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Filtry přehledu dokladů jako výběry. Řada čipů zabrala na telefonu dva
 * řádky a nedalo se v ní poznat, co je zapnuté.
 *
 * Adresu si skládá komponenta sama z aktuálních parametrů – funkci ze
 * serverové komponenty předat nelze (React ji neumí serializovat).
 */
export function DocFilters({
  typy,
  stavy,
}: {
  typy: { value: string; label: string }[];
  stavy: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const smer = sp.get("smer") ?? "";
  const typ = sp.get("typ") ?? "";
  const stav = sp.get("stav") ?? "";

  function go(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`${pathname}?${p.toString()}`);
  }

  const sel =
    "h-10 min-w-0 flex-1 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-800 focus-visible:border-stone-950 focus-visible:outline-none sm:h-9 sm:flex-none";
  const lab =
    "flex min-w-0 flex-1 flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400 sm:flex-none";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={lab}>
        Směr
        <select value={smer} onChange={(e) => go("smer", e.target.value)} className={sel}>
          <option value="">Vše</option>
          <option value="in">Vstup (přijaté)</option>
          <option value="out">Výstup (vystavené)</option>
        </select>
      </label>
      <label className={lab}>
        Typ
        <select value={typ} onChange={(e) => go("typ", e.target.value)} className={sel}>
          <option value="">Vše</option>
          {typy.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className={lab}>
        Stav
        <select value={stav} onChange={(e) => go("stav", e.target.value)} className={sel}>
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
