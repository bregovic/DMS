"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

/**
 * Volba období: nejdřív typ (měsíc / čtvrtletí / rok), pak konkrétní hodnota
 * a rok. Projekt je taky výběr, ne řada čipů – v přehledu se pak dá rychle
 * přepínat, aniž by lišta zabrala půl obrazovky.
 */
export function PeriodPicker({
  period,
  year,
  projectId,
  projects,
  years,
  allowAll = false,
}: {
  period: string;
  year: number;
  projectId: string;
  projects: { id: string; name: string }[];
  years: number[];
  /** Povolit volbu „vše" (u přehledu dokladů; v DPH ne). */
  allowAll?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const type = period === "vse" ? "vse" : period === "rok" ? "rok" : period.startsWith("q") ? "ctvrtleti" : "mesic";
  const value = period.startsWith("q") ? period.slice(1) : period.startsWith("m") ? period.replace("m", "") : "";

  function go(next: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  const sel = "h-9 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-800 focus-visible:border-stone-950 focus-visible:outline-none";
  const now = new Date();

  return (
    <div className="flex flex-wrap items-end gap-3 border border-stone-200 bg-white p-3 shadow-soft">
      <label className="text-[11px] uppercase tracking-wide text-stone-400">
        Typ období
        <select
          value={type}
          onChange={(e) => {
            const t = e.target.value;
            go({ period: t === "vse" ? "vse" : t === "rok" ? "rok" : t === "ctvrtleti" ? "q1" : `m${now.getUTCMonth() + 1}` });
          }}
          className={`${sel} mt-1 block`}
        >
          <option value="mesic">Měsíc</option>
          <option value="ctvrtleti">Čtvrtletí</option>
          <option value="rok">Rok</option>
          {allowAll && <option value="vse">Vše</option>}
        </select>
      </label>

      {type !== "rok" && type !== "vse" && (
        <label className="text-[11px] uppercase tracking-wide text-stone-400">
          {type === "mesic" ? "Měsíc" : "Čtvrtletí"}
          <select
            value={value}
            onChange={(e) => go({ period: `${type === "mesic" ? "m" : "q"}${e.target.value}` })}
            className={`${sel} mt-1 block`}
          >
            {type === "mesic"
              ? MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))
              : [1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {q}. čtvrtletí
                  </option>
                ))}
          </select>
        </label>
      )}

      {type !== "vse" && (
      <label className="text-[11px] uppercase tracking-wide text-stone-400">
        Rok
        <select value={year} onChange={(e) => go({ year: e.target.value })} className={`${sel} mt-1 block`}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      )}

      <label className="min-w-40 text-[11px] uppercase tracking-wide text-stone-400">
        Projekt
        <select value={projectId} onChange={(e) => go({ project: e.target.value || null })} className={`${sel} mt-1 block w-full`}>
          <option value="">Všechny projekty</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
