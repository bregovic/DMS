"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { updateDocumentNote } from "@/server/actions/documents";

/**
 * Poznámka k dokumentu – typicky „co se oproti dokumentaci změnilo“
 * (jiná střecha, posunuté okno…). AI ji bere v potaz při plánu i vytěžení.
 */
export function DocumentNote({ id, note, canEdit }: { id: string; note: string | null; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open)
    return note ? (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        className="mt-1 block w-full cursor-pointer whitespace-pre-line border-l-2 border-amber-400 bg-amber-50/60 px-2 py-1 text-left text-xs text-stone-700 disabled:cursor-default"
        title={canEdit ? "Upravit poznámku" : undefined}
      >
        {note}
      </button>
    ) : canEdit ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 flex cursor-pointer items-center gap-1 text-[11px] text-stone-400 hover:text-stone-950"
      >
        <MessageSquare className="size-3" /> Poznámka / změny oproti dokumentaci
      </button>
    ) : null;

  return (
    <form
      action={async (fd) => {
        setBusy(true);
        try {
          await updateDocumentNote(fd);
          setOpen(false);
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "Uložení se nepodařilo.");
        }
        setBusy(false);
      }}
      className="mt-1 space-y-1"
    >
      <input type="hidden" name="id" value={id} />
      <textarea
        name="note"
        rows={3}
        autoFocus
        defaultValue={note ?? ""}
        placeholder="Např. střecha místo sedlové plochá; okno v kuchyni posunuté o 40 cm; zateplení 200 mm místo 160 mm"
        className="flex w-full rounded-none border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-7 cursor-pointer bg-stone-950 px-3 text-xs text-white disabled:opacity-50">
          {busy ? "Ukládám…" : "Uložit"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-7 cursor-pointer px-2 text-xs text-stone-500">
          Zrušit
        </button>
      </div>
    </form>
  );
}
