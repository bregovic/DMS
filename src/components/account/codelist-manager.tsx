"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, X, ChevronRight } from "lucide-react";
import {
  addCodelistItem,
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

function AddRow({ kind }: { kind: string }) {
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-2 flex max-w-md items-center gap-2">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Přidat položku…"
        className="h-8 flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      <button
        type="button"
        disabled={pending || !label.trim()}
        onClick={() =>
          start(async () => {
            setErr(null);
            const fd = new FormData();
            fd.set("kind", kind);
            fd.set("label", label);
            try {
              await addCodelistItem(fd);
              setLabel("");
            } catch {
              setErr("Přidání selhalo.");
            }
          })
        }
        className="flex items-center gap-1 text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline disabled:opacity-40 cursor-pointer"
      >
        <Plus className="size-3.5" />
        Přidat
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

function CodelistDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-md border border-stone-300 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">{group.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">
          {group.items.length === 0 ? (
            <p className="text-sm text-stone-400">Žádné vlastní položky.</p>
          ) : (
            <ul className="border-t border-stone-200">
              {group.items.map((it) => (
                <Row key={it.id} kind={group.kind} item={it} />
              ))}
            </ul>
          )}
          <AddRow kind={group.kind} />
        </div>
      </div>
    </div>
  );
}

export function CodelistManager({ groups }: { groups: Group[] }) {
  const [openKind, setOpenKind] = useState<string | null>(null);
  const openGroup = groups.find((g) => g.kind === openKind) ?? null;

  return (
    <>
      <ul className="max-w-md border-t border-stone-200">
        {groups.map((g) => (
          <li key={g.kind}>
            <button
              type="button"
              onClick={() => setOpenKind(g.kind)}
              className="group flex w-full items-center justify-between border-b border-stone-200 py-2.5 text-left text-sm text-stone-800 hover:text-stone-950 cursor-pointer"
            >
              <span>
                {g.title}
                {g.items.length > 0 && (
                  <span className="ml-2 text-xs text-stone-400">
                    {g.items.length} vlastních
                  </span>
                )}
              </span>
              <ChevronRight className="size-4 text-stone-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
      {openGroup && (
        <CodelistDialog group={openGroup} onClose={() => setOpenKind(null)} />
      )}
    </>
  );
}
