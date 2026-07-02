"use client";

import { useEffect, useRef, useState } from "react";

export type ComboItem = { id: string; label: string; hourlyRate?: number | null };

export function Combobox({
  items,
  name,
  placeholder,
  defaultId,
  allowEmpty = true,
  emptyLabel = "— bez dodavatele —",
  onSelect,
  clearOnFocus = false,
}: {
  items: ComboItem[];
  name: string;
  placeholder?: string;
  defaultId?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onSelect?: (item: ComboItem | null) => void;
  // Předvyplněnou hodnotu při prvním kliknutí vynuluje, ať se hledá od začátku.
  clearOnFocus?: boolean;
}) {
  const initial = items.find((i) => i.id === defaultId) ?? null;
  const [id, setId] = useState(initial?.id ?? "");
  const [query, setQuery] = useState(initial?.label ?? "");
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = items
    .filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  function choose(item: ComboItem | null) {
    setId(item?.id ?? "");
    setQuery(item?.label ?? "");
    setOpen(false);
    setTouched(true);
    onSelect?.(item);
  }

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={id} />
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setId("");
          setTouched(true);
          setOpen(true);
        }}
        onFocus={() => {
          // Předvyplněnou (nedotčenou) hodnotu při prvním kliknutí vynuluj → čisté hledání.
          if (clearOnFocus && !touched && query) {
            setQuery("");
            setId("");
            setTouched(true);
          }
          setOpen(true);
        }}
        className="flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-stone-300 bg-white shadow-lg">
          {allowEmpty && (
            <li
              onMouseDown={(e) => {
                e.preventDefault();
                choose(null);
              }}
              className="cursor-pointer px-3 py-2 text-sm text-stone-500 hover:bg-stone-100"
            >
              {emptyLabel}
            </li>
          )}
          {filtered.map((i) => (
            <li
              key={i.id}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              className="cursor-pointer px-3 py-2 text-sm text-stone-950 hover:bg-stone-100"
            >
              {i.label}
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
