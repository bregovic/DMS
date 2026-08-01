"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowDownUp, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";

// Obecná lišta filtrace (název, datum od–do) a řazení. Stav drží v URL pod
// daným prefixem (např. "e" pro výdaje, "r" pro žádanky), ostatní parametry
// (sub, docType) se zachovají. Sdílí výdaje i žádanky.
export function ListFilters({
  prefix,
  placeholder = "Hledat v názvu…",
  sortOptions,
  selects = [],
}: {
  prefix: string;
  placeholder?: string;
  sortOptions: { value: string; label: string }[];
  // Volitelné rozbalovací filtry (např. dodavatel, stav) – stav v URL pod prefixem.
  selects?: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
  }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const k = (s: string) => `${prefix}${s}`;

  const [q, setQ] = useState(sp.get(k("q")) ?? "");
  const from = sp.get(k("from")) ?? "";
  const to = sp.get(k("to")) ?? "";
  /* Rozepsaný filtr se drží stranou od URL a odešle se až potvrzením.
     Dřív se sahalo do URL při každém úhozu, takže se přehled překresloval
     nad rozepsaným datem a výsledek působil, jako by filtr nefungoval. */
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const dirty = q !== (sp.get(k("q")) ?? "") || draftFrom !== from || draftTo !== to;

  function applyFilters() {
    setParam({ [k("q")]: q, [k("from")]: draftFrom, [k("to")]: draftTo });
  }
  const sort = sp.get(k("sort")) ?? sortOptions[0].value;
  const dir = sp.get(k("dir")) ?? "desc";

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

  const active =
    q || from || to || sp.get(k("sort")) || sp.get(k("dir")) ||
    selects.some((s) => sp.get(k(s.key)));
  const inputClass =
    "h-8 rounded-none border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") applyFilters();
        }}
        placeholder={placeholder}
        className={`${inputClass} w-full sm:w-44`}
      />
      <label className="flex items-center gap-1 text-xs text-stone-500">
        od
        <DateInput value={draftFrom} onChange={setDraftFrom} className={inputClass} />
      </label>
      <label className="flex items-center gap-1 text-xs text-stone-500">
        do
        <DateInput value={draftTo} onChange={setDraftTo} className={inputClass} />
      </label>
      <button
        type="button"
        onClick={applyFilters}
        className={`${inputClass} ${dirty ? "border-stone-950 bg-stone-950 text-white" : "text-stone-600"} cursor-pointer px-3`}
      >
        Filtrovat
      </button>

      {selects.map((s) => (
        <select
          key={s.key}
          value={sp.get(k(s.key)) ?? ""}
          onChange={(e) => setParam({ [k(s.key)]: e.target.value })}
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

      <div className="flex w-full items-center gap-1 sm:ml-auto sm:w-auto">
        <select
          value={sort}
          onChange={(e) => setParam({ [k("sort")]: e.target.value })}
          className={`${inputClass} flex-1 sm:flex-none`}
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
          className="flex h-8 items-center gap-1 border border-stone-300 px-2 text-xs text-stone-700 hover:border-stone-950 cursor-pointer"
        >
          <ArrowDownUp className="size-3.5" />
          {dir === "asc" ? "↑" : "↓"}
        </button>
        {active && (
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
                ...Object.fromEntries(selects.map((s) => [k(s.key), null])),
              });
            }}
            className="flex size-8 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
