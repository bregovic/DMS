"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { colorClasses } from "@/lib/status-colors";

/** Parametr adresy s vybranými stavy: `tst=todo,doing`. */
export const TASK_STATUS_PARAM = "tst";

/**
 * Filtr úkolů podle stavu – čipy, víc stavů najednou.
 *
 * Výběr drží adresa (jde poslat odkaz), a navíc se pamatuje v prohlížeči
 * pro každý projekt: po přepnutí na Výdaje a zpět, nebo po návratu
 * z detailu, se filtr obnoví. Bez toho se po každém odchodu ztratil.
 */
export function TaskStatusFilter({
  projectId,
  statuses,
  counts,
}: {
  projectId: string;
  statuses: { key: string; label: string; color?: string | null }[];
  /** Kolik úkolů je v jednotlivých stavech (bez filtru). */
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const storageKey = `dms-tst:${projectId}`;

  const current = (sp.get(TASK_STATUS_PARAM) ?? "").split(",").filter(Boolean);
  const selected = new Set(current);

  // Adresa bez filtru, ale v prohlížeči zapamatovaný → obnovit.
  useEffect(() => {
    if (sp.has(TASK_STATUS_PARAM)) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {}
    if (!saved) return;
    const params = new URLSearchParams(sp.toString());
    params.set(TASK_STATUS_PARAM, saved);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // Jen při příchodu na stránku – další změny řídí kliknutí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(next: Set<string>) {
    const value = [...next].join(",");
    try {
      if (value) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    } catch {}
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(TASK_STATUS_PARAM, value);
    else params.delete(TASK_STATUS_PARAM);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  }

  const chip = (on: boolean) =>
    `flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors ${
      on
        ? "border-stone-950 bg-stone-950 text-white"
        : "border-stone-300 text-stone-600 hover:border-stone-950"
    }`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtr podle stavu">
      <span className="kicker mr-1">Stav</span>
      <button type="button" onClick={() => apply(new Set())} className={chip(selected.size === 0)}>
        Vše
      </button>
      {statuses.map((s) => {
        const on = selected.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            aria-pressed={on}
            className={chip(on)}
          >
            <span className={`size-2 rounded-full ${colorClasses(s.color ?? "stone").dot}`} />
            {s.label}
            <span className={on ? "text-stone-300" : "text-stone-400"}>{counts[s.key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
