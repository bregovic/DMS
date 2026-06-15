"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export type PickerOp = { id: string; name?: string; unit: string; code: string };

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Vyhledávací pole + filtrovaný seznam úkonů (hledá v názvu i kódu, bez
 *  ohledu na diakritiku). Klik na položku zavolá onPick. */
export function OperationPicker({
  ops,
  onPick,
  placeholder = "Hledat činnost… (název nebo kód)",
}: {
  ops: PickerOp[] | null;
  onPick: (op: PickerOp) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const nq = norm(q.trim());
  const filtered = !ops
    ? []
    : nq
      ? ops.filter((o) => norm(`${o.name ?? ""} ${o.code}`).includes(nq))
      : ops;

  return (
    <div className="space-y-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} disabled={!ops} />
      {!ops ? (
        <p className="text-[11px] text-stone-400">Načítám katalog…</p>
      ) : !nq ? (
        // Seznam se rozbalí až po zadání filtru.
        ops.length === 0 ? <p className="text-[11px] text-stone-400">Katalog je prázdný.</p> : null
      ) : filtered.length === 0 ? (
        <p className="text-[11px] text-stone-400">Nic nenalezeno.</p>
      ) : (
        <div className="max-h-52 divide-y divide-stone-100 overflow-y-auto border border-stone-200">
          {filtered.slice(0, 100).map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => {
                // Výběr na stisk (ne klik) – na mobilu se jinak ztratí kvůli
                // rozostření hledacího pole / zavírání klávesnice.
                e.preventDefault();
                onPick(o);
              }}
              className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-50 cursor-pointer"
            >
              <span className="text-stone-950">{o.name}</span>
              <span className="shrink-0 text-xs text-stone-400">
                {o.unit} · {o.code}
              </span>
            </button>
          ))}
          {filtered.length > 100 && (
            <p className="px-3 py-1.5 text-[11px] text-stone-400">
              Zobrazeno prvních 100 – upřesni hledání.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
