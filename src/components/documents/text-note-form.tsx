"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";
import { createTextNote } from "@/server/actions/documents";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Nová textová poznámka k dokumentaci projektu (používá ji i plánování). */
export function TextNoteForm({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex h-8 cursor-pointer items-center gap-1.5 border border-stone-300 px-3 text-xs text-stone-700 transition-colors hover:border-stone-950"
      >
        <StickyNote className="size-3.5" /> Textová poznámka
      </button>
      {open && (
        <Dialog title="Textová poznámka k dokumentaci" size="lg" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                await createTextNote(fd);
                setOpen(false);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Uložení se nepodařilo.");
              }
              setBusy(false);
            }}
            className="space-y-3 p-5"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input
              name="title"
              placeholder="Název – např. Změny oproti projektové dokumentaci"
              className="flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
            />
            <textarea
              name="text"
              rows={10}
              required
              autoFocus
              placeholder={"Např.\n– střecha plochá místo sedlové\n– okna Kömmerling 76, trojsklo\n– zednické práce svépomocí\n– elektro bez rozvodů v podlaze"}
              className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
            />
            <p className="text-[11px] text-stone-400">
              Uloží se mezi dokumenty projektu – plán z dokumentace ji vezme v potaz spolu s ostatními podklady.
            </p>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Ukládám…" : "Uložit poznámku"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
