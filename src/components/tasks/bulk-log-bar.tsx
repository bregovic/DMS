"use client";

import { useEffect, useState } from "react";
import { Clock, Paperclip, X } from "lucide-react";
import { logTasksExpenseBulk } from "@/server/actions/my-tasks";
import { prepareUpload } from "@/lib/client-upload";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const PICK_ATTR = "data-pick-task";

type T = { id: string; title: string; percent: number; due: string | null };

const cell =
  "h-10 w-full rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

/**
 * Hromadné vykázání (Moje úkoly): zaškrtnuté úkoly → jeden dialog, u každého
 * hodiny (nebo částka), % hotovo a předpokládané dokončení; společné datum,
 * sazba, poznámka a přílohy. Zaškrtávátko v řádku úkol vybírá – neukončuje.
 */
export function BulkLogBar({ tasks, defaultRate }: { tasks: T[]; defaultRate: number | null }) {
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hours" | "amount">("hours");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[${PICK_ATTR}]`));
  useEffect(() => {
    const on = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.hasAttribute?.(PICK_ATTR)) setSel(boxes().filter((b) => b.checked).map((b) => b.value));
    };
    document.addEventListener("change", on);
    return () => document.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(t);
  }, [msg]);
  const clear = () => {
    boxes().forEach((b) => (b.checked = false));
    setSel([]);
  };
  const chosen = tasks.filter((t) => sel.includes(t.id));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {sel.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-stone-300 bg-white/95 px-4 py-3 shadow-lift backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <span className="text-sm font-medium text-stone-950">Vybráno {sel.length}</span>
            <Button type="button" onClick={() => setOpen(true)}>
              <Clock className="size-4" /> Vykázat na vybrané
            </Button>
            <button type="button" onClick={clear} aria-label="Zrušit výběr" className="ml-auto cursor-pointer p-2 text-stone-400 hover:text-stone-950">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      {msg && sel.length === 0 && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 bg-stone-950 px-3 py-2 text-xs text-white shadow-lift md:bottom-4">
          {msg}
        </div>
      )}

      {open && (
        <Dialog title={`Vykázat na ${chosen.length} úkoly`} size="2xl" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                fd.delete("files");
                let total = 0;
                for (const f of files) {
                  const p = await prepareUpload(f);
                  total += p.size;
                  fd.append("files", p);
                }
                if (total > 14 * 1024 * 1024) throw new Error("Přílohy mají dohromady víc než 14 MB.");
                const r = await logTasksExpenseBulk(fd);
                setOpen(false);
                setFiles([]);
                clear();
                setMsg(`Vykázáno na ${r.logged} úkolů.`);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Uložení selhalo.");
              }
              setBusy(false);
            }}
            className="space-y-4 p-5"
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "hours", l: "Hodiny × sazba" },
                  { v: "amount", l: "Částky" },
                ] as const
              ).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  onClick={() => setMode(m.v)}
                  className={`h-9 cursor-pointer border text-sm ${
                    mode === m.v ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-600 hover:border-stone-950"
                  }`}
                >
                  {m.l}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_6rem_5rem_9rem] gap-2 text-[11px] uppercase tracking-wide text-stone-400 sm:grid">
                <span>Úkol</span>
                <span>{mode === "hours" ? "Hodin" : "Kč"}</span>
                <span>Hotovo %</span>
                <span>Předpokl. dokončení</span>
              </div>
              {chosen.map((t) => (
                <div key={t.id} className="grid grid-cols-3 items-center gap-2 border-b border-stone-100 pb-2 sm:grid-cols-[1fr_6rem_5rem_9rem] sm:border-0 sm:pb-0">
                  <input type="hidden" name="taskIds" value={t.id} />
                  <span className="col-span-3 truncate text-sm text-stone-900 sm:col-span-1" title={t.title}>
                    {t.title}
                  </span>
                  <input
                    name={mode === "hours" ? `hours_${t.id}` : `amount_${t.id}`}
                    inputMode="decimal"
                    placeholder={mode === "hours" ? "h" : "Kč"}
                    aria-label={`${mode === "hours" ? "Hodin" : "Částka"} – ${t.title}`}
                    className={cell}
                  />
                  <input
                    name={`percent_${t.id}`}
                    inputMode="numeric"
                    defaultValue={t.percent || ""}
                    placeholder="%"
                    aria-label={`Hotovo % – ${t.title}`}
                    className={cell}
                  />
                  <input
                    type="date"
                    name={`end_${t.id}`}
                    defaultValue={t.due ?? ""}
                    aria-label={`Předpokládané dokončení – ${t.title}`}
                    className={cell}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
              {mode === "hours" && (
                <label className="block text-xs text-stone-600">
                  Sazba Kč/h
                  <input name="rate" inputMode="decimal" defaultValue={defaultRate ?? ""} className={`${cell} mt-1`} />
                </label>
              )}
              <label className="block text-xs text-stone-600">
                Datum
                <input type="date" name="date" defaultValue={today} className={`${cell} mt-1`} />
              </label>
              <label className="flex h-10 cursor-pointer items-center justify-center gap-1.5 border border-dashed border-stone-300 text-sm text-stone-600 hover:border-stone-950">
                <Paperclip className="size-4" />
                {files.length ? `${files.length} příloh` : "Přílohy / fotky"}
                <input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
              </label>
            </div>
            <label className="block text-xs text-stone-600">
              Poznámka (u všech)
              <input name="description" placeholder="co se dělalo" className={`${cell} mt-1`} />
            </label>
            <p className="text-[11px] text-stone-400">
              Řádek bez údajů se přeskočí. Přílohy se přiloží ke každému vykázání. 100 % = hotovo; změna % nebo termínu
              přepočítá plán.
            </p>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Ukládám…" : "Vykázat"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
