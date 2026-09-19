"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { logTasksExpenseBulk } from "@/server/actions/my-tasks";
import { prepareUpload } from "@/lib/client-upload";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type BulkLogTask = { id: string; title: string; percent: number; due: string | null };

const cell =
  "h-10 w-full rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

/**
 * Hromadné vykázání: u každého vybraného úkolu hodiny (nebo částka
 * s nepovinnými hodinami), % hotovo a předpokládané dokončení; společné
 * datum, sazba, poznámka a přílohy. Otevírá se z hromadné lišty úkolů.
 */
export function BulkLogDialog({
  tasks: chosen,
  defaultRate,
  onClose,
  onDone,
}: {
  tasks: BulkLogTask[];
  defaultRate: number | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"hours" | "amount">("hours");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const cols = mode === "hours" ? "sm:grid-cols-[1fr_6rem_5rem_9rem]" : "sm:grid-cols-[1fr_6rem_5rem_5rem_9rem]";

  return (
    <Dialog title={`Vykázat na ${chosen.length} úkoly`} size="2xl" onClose={onClose}>
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
            onDone(`Vykázáno na ${r.logged} ${r.logged === 1 ? "úkol" : r.logged < 5 ? "úkoly" : "úkolů"}.`);
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
          <div className={`hidden gap-2 text-[11px] uppercase tracking-wide text-stone-400 sm:grid ${cols}`}>
            <span>Úkol</span>
            <span>{mode === "hours" ? "Hodin" : "Kč"}</span>
              {mode === "amount" && <span>Hodin</span>}
            <span>Hotovo %</span>
            <span>Předpokl. dokončení</span>
          </div>
          {chosen.map((t) => (
            <div key={t.id} className={`grid items-center gap-2 border-b border-stone-100 pb-2 sm:border-0 sm:pb-0 ${mode === "hours" ? "grid-cols-3" : "grid-cols-4"} ${cols}`}>
              <input type="hidden" name="taskIds" value={t.id} />
              <input type="hidden" name={`pct_orig_${t.id}`} value={t.percent || ""} />
              <input type="hidden" name={`due_orig_${t.id}`} value={t.due ?? ""} />
              <span className={`truncate text-sm text-stone-900 sm:col-span-1 ${mode === "hours" ? "col-span-3" : "col-span-4"}`} title={t.title}>
                {t.title}
              </span>
              <input
                name={mode === "hours" ? `hours_${t.id}` : `amount_${t.id}`}
                inputMode="decimal"
                placeholder={mode === "hours" ? "h" : "Kč"}
                aria-label={`${mode === "hours" ? "Hodin" : "Částka"} – ${t.title}`}
                className={cell}
              />
              {mode === "amount" && (
                <input
                  name={`amhours_${t.id}`}
                  inputMode="decimal"
                  placeholder="h"
                  title="Hodiny jen pro evidenci – částku nepřepočítávají"
                  aria-label={`Hodin (nepovinné) – ${t.title}`}
                  className={cell}
                />
              )}
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
          Řádek bez údajů se přeskočí. U částky jsou hodiny nepovinné a částku nepřepočítávají. Přílohy se přiloží ke každému vykázání. 100 % = hotovo; změna % nebo termínu
          přepočítá plán.
        </p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Ukládám…" : "Vykázat"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
