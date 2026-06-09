"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteCodelistItem,
  renameCodelistItem,
} from "@/server/actions/codelists";
import { Input } from "@/components/ui/input";

type Item = { id: string; label: string };
type Group = { kind: string; title: string; items: Item[] };

function Row({ kind, item }: { kind: string; item: Item }) {
  const [label, setLabel] = useState(item.label);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <li className="flex items-center gap-2 border-b border-stone-200 py-2">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="h-8 flex-1"
      />
      <button
        type="button"
        disabled={pending || label.trim() === item.label}
        onClick={() =>
          start(async () => {
            setErr(null);
            const fd = new FormData();
            fd.set("kind", kind);
            fd.set("id", item.id);
            fd.set("label", label);
            try {
              await renameCodelistItem(fd);
            } catch {
              setErr("Uložení selhalo.");
            }
          })
        }
        className="text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline disabled:opacity-40 cursor-pointer"
      >
        Uložit
      </button>
      <button
        type="button"
        title="Smazat"
        onClick={() => {
          if (!window.confirm(`Smazat „${item.label}"?`)) return;
          start(async () => {
            setErr(null);
            const fd = new FormData();
            fd.set("kind", kind);
            fd.set("id", item.id);
            try {
              await deleteCodelistItem(fd);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Smazání selhalo.");
            }
          });
        }}
        className="flex size-7 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white cursor-pointer"
      >
        <Trash2 className="size-3.5" />
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </li>
  );
}

export function CodelistManager({ groups }: { groups: Group[] }) {
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <div key={g.kind}>
          <h3 className="kicker mb-2">{g.title}</h3>
          {g.items.length === 0 ? (
            <p className="text-sm text-stone-400">Žádné vlastní položky.</p>
          ) : (
            <ul className="max-w-md border-t border-stone-200">
              {g.items.map((it) => (
                <Row key={it.id} kind={g.kind} item={it} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
