"use client";

import { useEffect, useRef, useState } from "react";

export type ComboItem = { id: string; label: string; hourlyRate?: number | null };

/** Bez diakritiky a velikosti písmen – „karol“ najde „Karol“, „zdenek“ „Zdeněk“. */
function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function Combobox({
  items,
  name,
  placeholder,
  defaultId,
  allowEmpty = true,
  emptyLabel = "— bez dodavatele —",
  onSelect,
  clearOnFocus = true,
  dropUp = false,
}: {
  items: ComboItem[];
  name: string;
  placeholder?: string;
  defaultId?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onSelect?: (item: ComboItem | null) => void;
  /** Kliknutím do pole se hodnota vyprázdní a nabídne se celý seznam;
   *  odchod bez výběru vrátí původní hodnotu. */
  clearOnFocus?: boolean;
  /** Nabídka nad polem (pro lišty u spodního okraje). */
  dropUp?: boolean;
}) {
  const initial = items.find((i) => i.id === defaultId) ?? null;
  const [id, setId] = useState(initial?.id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [query, setQuery] = useState(initial?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Zavřít bez výběru = vrátit zobrazenou hodnotu k tomu, co je vybrané.
  function close() {
    setOpen(false);
    setQuery(label);
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  });

  const q = norm(query.trim());
  // Shoda na začátku slova má přednost před shodou uprostřed.
  const filtered = (q
    ? items
        .map((i) => {
          const n = norm(i.label);
          const pos = n.indexOf(q);
          if (pos < 0) return null;
          const wordStart = pos === 0 || /\s|[-–(]/.test(n[pos - 1]);
          return { i, rank: pos === 0 ? 0 : wordStart ? 1 : 2 };
        })
        .filter((x): x is { i: ComboItem; rank: number } => !!x)
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.i)
    : items
  ).slice(0, 50);
  const options: (ComboItem | null)[] = [...(allowEmpty ? [null] : []), ...filtered];

  function choose(item: ComboItem | null) {
    setId(item?.id ?? "");
    setLabel(item?.label ?? "");
    setQuery(item?.label ?? "");
    setOpen(false);
    onSelect?.(item);
  }

  function move(delta: number) {
    if (!open) setOpen(true);
    setActive((a) => {
      const n = Math.max(0, Math.min(options.length - 1, a + delta));
      listRef.current?.children[n]?.scrollIntoView({ block: "nearest" });
      return n;
    });
  }

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={id} />
      <input
        value={query}
        placeholder={open && clearOnFocus && label ? label : placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // první skutečná shoda (ne „bez dodavatele“)
          setActive(allowEmpty && e.target.value.trim() ? 1 : 0);
        }}
        onFocus={() => {
          if (clearOnFocus) setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onClick={() => {
          // druhé kliknutí do pole, které už má fokus (po výběru)
          if (open) return;
          if (clearOnFocus) setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => {
          // Tab ven z pole; klik do nabídky blur nevyvolá (preventDefault).
          if (open) close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter" && open) {
            // Enter vybírá, neodesílá formulář.
            e.preventDefault();
            const pick = options[active];
            if (pick !== undefined && (pick !== null || !query.trim())) choose(pick);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
          }
        }}
        className="flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
      />
      {open && (
        <ul
          ref={listRef}
          className={`absolute z-20 ${dropUp ? "bottom-full mb-1" : "mt-1"} max-h-56 w-full overflow-auto border border-stone-300 bg-white shadow-lg`}
        >
          {options.map((i, n) => (
            <li
              key={i?.id ?? "__empty__"}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => setActive(n)}
              className={`cursor-pointer px-3 py-2 text-sm ${i ? "text-stone-950" : "text-stone-500"} ${n === active ? "bg-stone-100" : ""} ${i && i.id === id ? "font-medium" : ""}`}
            >
              {i ? i.label : emptyLabel}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-stone-400">Nic nenalezeno</li>
          )}
        </ul>
      )}
    </div>
  );
}
