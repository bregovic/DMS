"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowDownUp, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { colorClasses } from "@/lib/status-colors";
import { ALL_STATUSES } from "@/lib/list-filter";

/**
 * Jednotná lišta filtrace a řazení pro všechny seznamy – standard
 * a názvy parametrů popisuje `src/lib/list-filter.ts`.
 *
 * Výchozí je sbalená: tlačítko Filtr (s počtem aktivních filtrů), shrnutí
 * aktivních filtrů a řazení. Po rozbalení hledání, datum od–do, stavy
 * (čipy, víc najednou) a další rozbalovací filtry.
 */
export function ListFilters({
  prefix,
  placeholder = "Hledat v názvu…",
  sortOptions,
  selects = [],
  statuses,
  defaultStatuses = [],
  dates = true,
}: {
  prefix: string;
  placeholder?: string;
  sortOptions: { value: string; label: string }[];
  // Volitelné rozbalovací filtry (např. dodavatel) – stav v URL pod prefixem.
  selects?: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
  }[];
  /** Stavy jako čipy (víc najednou), parametr <prefix>st. */
  statuses?: { key: string; label: string; color?: string | null; count?: number }[];
  /** Výběr stavů bez parametru v adrese – typicky neukončené. */
  defaultStatuses?: string[];
  /** Zobrazit filtr datum od–do. */
  dates?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const k = (s: string) => `${prefix}${s}`;
  const [open, setOpen] = useState(false);

  const [q, setQ] = useState(sp.get(k("q")) ?? "");
  const from = sp.get(k("from")) ?? "";
  const to = sp.get(k("to")) ?? "";
  /* Rozepsaný filtr se drží stranou od URL a odešle se až potvrzením.
     Dřív se sahalo do URL při každém úhozu, takže se přehled překresloval
     nad rozepsaným datem a výsledek působil, jako by filtr nefungoval. */
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const dirty = q !== (sp.get(k("q")) ?? "") || draftFrom !== from || draftTo !== to;

  /* Hodnoty se dají předat přímo – po dopsání data (Enter / opuštění pole)
     je nemá smysl číst ze stavu, ten se ještě nemusel překreslit. */
  function applyFilters(over?: { from?: string; to?: string }) {
    setParam({
      [k("q")]: q,
      [k("from")]: over?.from ?? draftFrom,
      [k("to")]: over?.to ?? draftTo,
    });
  }
  const sort = sp.get(k("sort")) ?? sortOptions[0].value;
  const dir = sp.get(k("dir")) ?? "desc";

  // Stavy: bez parametru platí výchozí výběr, "all" = všechny.
  const stRaw = sp.get(k("st"));
  const stSelected: Set<string> | null =
    stRaw === null
      ? defaultStatuses.length
        ? new Set(defaultStatuses)
        : null
      : stRaw === ALL_STATUSES || stRaw === ""
        ? null
        : new Set(stRaw.split(",").filter(Boolean));
  const isDefaultSt = stRaw === null;
  // Doplněk výchozího výběru = ukončené (hotové, zrušené…) – vlastní čip.
  const closedStatuses = defaultStatuses.length
    ? (statuses ?? []).map((s) => s.key).filter((key) => !defaultStatuses.includes(key))
    : [];
  const sameSet = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));

  function setParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [key, v] of Object.entries(updates)) {
      if (v == null || v === "") params.delete(key);
      else params.set(key, v);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // vynutit nové vykreslení na serveru – samotná změna parametrů v URL
    // se může obsloužit z klientské cache a přehled by zůstal starý
    router.refresh();
  }

  function setStatuses(next: Set<string> | null) {
    const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
    if (next && defaultStatuses.length && same(next, defaultStatuses)) setParam({ [k("st")]: null });
    else if (next === null || next.size === 0)
      setParam({ [k("st")]: defaultStatuses.length ? ALL_STATUSES : null });
    else setParam({ [k("st")]: [...next].join(",") });
  }
  function toggleStatus(key: string) {
    const next = new Set(stSelected ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setStatuses(next);
  }

  // Shrnutí aktivních filtrů pro sbalenou lištu.
  const summary: string[] = [];
  const curQ = sp.get(k("q"));
  if (curQ) summary.push(`„${curQ}“`);
  if (from || to) summary.push(`${from ? `od ${from.split("-").reverse().join(".")}` : ""}${from && to ? " " : ""}${to ? `do ${to.split("-").reverse().join(".")}` : ""}`);
  for (const s of selects) {
    const v = sp.get(k(s.key));
    if (v) summary.push(s.options.find((o) => o.value === v)?.label ?? v);
  }
  if (statuses) {
    if (isDefaultSt && defaultStatuses.length) summary.push("neukončené");
    else if (closedStatuses.length && stSelected && sameSet(stSelected, closedStatuses)) summary.push("ukončené");
    else if (stSelected)
      summary.push(
        statuses
          .filter((s) => stSelected.has(s.key))
          .map((s) => s.label)
          .join(", ") || "žádný stav",
      );
  }
  const activeCount =
    (curQ ? 1 : 0) +
    (from || to ? 1 : 0) +
    selects.filter((s) => sp.get(k(s.key))).length +
    (statuses && stSelected ? 1 : 0);
  const resettable =
    curQ || from || to || sp.get(k("sort")) || sp.get(k("dir")) || stRaw !== null ||
    selects.some((s) => sp.get(k(s.key)));

  const inputClass =
    "h-8 rounded-none border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950";
  const chip = (on: boolean) =>
    `flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors ${
      on ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-600 hover:border-stone-950"
    }`;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-xs transition-colors ${
            open ? "border-stone-950 text-stone-950" : "border-stone-300 text-stone-700 hover:border-stone-950"
          }`}
        >
          <SlidersHorizontal className="size-3.5" />
          Filtr
          {activeCount > 0 && (
            <span className="bg-stone-950 px-1 text-[10px] leading-4 text-white">{activeCount}</span>
          )}
          <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {!open && summary.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-w-0 max-w-full cursor-pointer truncate text-left text-xs text-stone-500 hover:text-stone-950"
          >
            {summary.join(" · ")}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <select
            value={sort}
            onChange={(e) => setParam({ [k("sort")]: e.target.value })}
            aria-label="Řadit podle"
            className={inputClass}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={dir === "asc" ? "Vzestupně" : "Sestupně"}
            aria-label={dir === "asc" ? "Řadit vzestupně" : "Řadit sestupně"}
            onClick={() => setParam({ [k("dir")]: dir === "asc" ? "desc" : "asc" })}
            className="flex h-8 cursor-pointer items-center gap-1 border border-stone-300 px-2 text-xs text-stone-700 hover:border-stone-950"
          >
            <ArrowDownUp className="size-3.5" />
            {dir === "asc" ? "↑" : "↓"}
          </button>
          {resettable && (
            <button
              type="button"
              title="Zrušit filtr a řazení"
              aria-label="Zrušit filtr a řazení"
              onClick={() => {
                setQ("");
                setDraftFrom("");
                setDraftTo("");
                setParam({
                  [k("q")]: null,
                  [k("from")]: null,
                  [k("to")]: null,
                  [k("sort")]: null,
                  [k("dir")]: null,
                  [k("st")]: null,
                  ...Object.fromEntries(selects.map((s) => [k(s.key), null])),
                });
              }}
              className="flex size-8 cursor-pointer items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-3 border border-stone-200 bg-white/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder={placeholder}
              className={`${inputClass} w-full sm:w-44`}
            />
            {dates && (
              <>
                <label className="flex items-center gap-1 text-xs text-stone-500">
                  od
                  <DateInput
                    value={draftFrom}
                    onChange={setDraftFrom}
                    onCommit={(v) => applyFilters({ from: v })}
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-stone-500">
                  do
                  <DateInput
                    value={draftTo}
                    onChange={setDraftTo}
                    onCommit={(v) => applyFilters({ to: v })}
                    className={inputClass}
                  />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() => applyFilters()}
              className={`${inputClass} ${dirty ? "border-stone-950 bg-stone-950 text-white" : "text-stone-600"} cursor-pointer px-3`}
            >
              Filtrovat
            </button>
            {selects.map((s) => (
              <select
                key={s.key}
                value={sp.get(k(s.key)) ?? ""}
                onChange={(e) => setParam({ [k(s.key)]: e.target.value })}
                aria-label={s.label}
                className={inputClass}
              >
                <option value="">{s.label}</option>
                {s.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}
          </div>

          {statuses && statuses.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtr podle stavu">
              <span className="kicker mr-1">Stav</span>
              {defaultStatuses.length > 0 && (
                <button type="button" onClick={() => setParam({ [k("st")]: null })} className={chip(isDefaultSt)}>
                  Neukončené
                </button>
              )}
              {closedStatuses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStatuses(new Set(closedStatuses))}
                  className={chip(!isDefaultSt && !!stSelected && sameSet(stSelected, closedStatuses))}
                >
                  Ukončené
                </button>
              )}
              <button type="button" onClick={() => setStatuses(null)} className={chip(!isDefaultSt && stSelected === null)}>
                Vše
              </button>
              {statuses.map((s) => {
                const on = !!stSelected?.has(s.key) && !isDefaultSt;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => (isDefaultSt ? setStatuses(new Set([s.key])) : toggleStatus(s.key))}
                    aria-pressed={on}
                    className={chip(on)}
                  >
                    {s.color !== undefined && (
                      <span className={`size-2 rounded-full ${colorClasses(s.color ?? "stone").dot}`} />
                    )}
                    {s.label}
                    {s.count !== undefined && (
                      <span className={on ? "text-stone-300" : "text-stone-400"}>{s.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
