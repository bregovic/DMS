"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowDownUp, X } from "lucide-react";

// Obecná lišta filtrace (název, datum od–do) a řazení. Stav drží v URL pod
// daným prefixem (např. "e" pro výdaje, "r" pro žádanky), ostatní parametry
// (sub, docType) se zachovají. Sdílí výdaje i žádanky.
export function ListFilters({
  prefix,
  placeholder = "Hledat v názvu…",
  sortOptions,
}: {
  prefix: string;
  placeholder?: string;
  sortOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const k = (s: string) => `${prefix}${s}`;

  const [q, setQ] = useState(sp.get(k("q")) ?? "");
  const from = sp.get(k("from")) ?? "";
  const to = sp.get(k("to")) ?? "";
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
  }

  const active =
    q || from || to || sp.get(k("sort")) || sp.get(k("dir"));
  const inputClass =
    "h-8 rounded-none border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam({ [k("q")]: q });
        }}
        onBlur={() => setParam({ [k("q")]: q })}
        placeholder={placeholder}
        className={`${inputClass} w-44`}
      />
      <label className="flex items-center gap-1 text-xs text-stone-500">
        od
        <input
          type="date"
          value={from}
          onChange={(e) => setParam({ [k("from")]: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-stone-500">
        do
        <input
          type="date"
          value={to}
          onChange={(e) => setParam({ [k("to")]: e.target.value })}
          className={inputClass}
        />
      </label>

      <div className="ml-auto flex items-center gap-1">
        <select
          value={sort}
          onChange={(e) => setParam({ [k("sort")]: e.target.value })}
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
            onClick={() => {
              setQ("");
              setParam({
                [k("q")]: null,
                [k("from")]: null,
                [k("to")]: null,
                [k("sort")]: null,
                [k("dir")]: null,
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
