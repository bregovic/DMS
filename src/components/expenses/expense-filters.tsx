"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowDownUp, X } from "lucide-react";

// Filtrace (název, datum od–do) a řazení (datum / částka) výdajů.
// Stav drží v URL (searchParams) – ostatní parametry (sub, docType) se zachovají.
export function ExpenseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("eq") ?? "");
  const from = sp.get("efrom") ?? "";
  const to = sp.get("eto") ?? "";
  const sort = sp.get("esort") ?? "date";
  const dir = sp.get("edir") ?? "desc";

  function setParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const active = q || from || to || sp.get("esort") || sp.get("edir");
  const inputClass =
    "h-8 rounded-none border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam({ eq: q });
        }}
        onBlur={() => setParam({ eq: q })}
        placeholder="Hledat v názvu…"
        className={`${inputClass} w-44`}
      />
      <label className="flex items-center gap-1 text-xs text-stone-500">
        od
        <input
          type="date"
          value={from}
          onChange={(e) => setParam({ efrom: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-stone-500">
        do
        <input
          type="date"
          value={to}
          onChange={(e) => setParam({ eto: e.target.value })}
          className={inputClass}
        />
      </label>

      <div className="ml-auto flex items-center gap-1">
        <select
          value={sort}
          onChange={(e) => setParam({ esort: e.target.value })}
          className={inputClass}
        >
          <option value="date">Datum</option>
          <option value="amount">Částka</option>
        </select>
        <button
          type="button"
          title={dir === "asc" ? "Vzestupně" : "Sestupně"}
          onClick={() => setParam({ edir: dir === "asc" ? "desc" : "asc" })}
          className="flex h-8 items-center gap-1 border border-stone-300 px-2 text-xs text-stone-700 hover:border-stone-950 cursor-pointer"
        >
          <ArrowDownUp className="size-3.5" />
          {dir === "asc" ? "↑" : "↓"}
        </button>
        {active && (
          <button
            type="button"
            title="Zrušit filtr a řazení"
            onClick={() => {
              setQ("");
              setParam({ eq: null, efrom: null, eto: null, esort: null, edir: null });
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
