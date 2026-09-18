"use client";

import { useRef, useState } from "react";
import { Clock, Paperclip } from "lucide-react";
import { logTaskExpense } from "@/server/actions/my-tasks";
import { prepareUpload } from "@/lib/client-upload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

const fieldClass =
  "flex h-11 w-full rounded-none border border-stone-300 bg-white px-3 text-base text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none sm:h-10 sm:text-sm";

/**
 * Vykázání na úkol (#29): hodiny × sazba nebo částka, % hotovo,
 * předpokládané dokončení a přílohy (fotky z práce, účtenky).
 *
 * Na telefonu se vyplňuje palcem na stavbě, proto velká pole, číselná
 * klávesnice a sazba předvyplněná z minula. Stačí i jen % nebo termín –
 * pak se jen aktualizuje průběh a plán se přepočítá.
 */
export function LogTaskExpense({
  taskId,
  taskTitle,
  defaultRate,
  percentDone = 0,
  dueDate = null,
}: {
  taskId: string;
  taskTitle: string;
  defaultRate: number | null;
  percentDone?: number;
  dueDate?: string | null; // YYYY-MM-DD
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hours" | "amount">("hours");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const h = Number(hours.replace(",", "."));
  const r = Number(rate.replace(",", "."));
  const preview = mode === "hours" && h > 0 && r > 0 ? Math.round(h * r) : null;
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Clock className="size-4" />
        Vykázat
      </Button>
    );
  }

  return (
    <Dialog title={`Vykázat · ${taskTitle}`} size="md" onClose={() => setOpen(false)}>
      <form
        ref={formRef}
        action={async (fd) => {
          setError(null);
          setBusy(true);
          try {
            fd.delete("files");
            let total = 0;
            for (const f of files) {
              const p = await prepareUpload(f);
              total += p.size;
              fd.append("files", p);
            }
            if (total > 14 * 1024 * 1024) throw new Error("Přílohy mají dohromady víc než 14 MB – přidej je po částech.");
            await logTaskExpense(fd);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Uložení selhalo.");
            setBusy(false);
            return;
          }
          setBusy(false);
          setHours("");
          setFiles([]);
          formRef.current?.reset();
          setOpen(false);
        }}
        className="space-y-4 p-5"
      >
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="pct_orig" value={percentDone || ""} />
        <input type="hidden" name="due_orig" value={dueDate ?? ""} />

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "hours", l: "Hodiny × sazba" },
              { v: "amount", l: "Částka" },
            ] as const
          ).map((m) => (
            <button
              key={m.v}
              type="button"
              onClick={() => setMode(m.v)}
              className={`h-10 border text-sm transition-colors cursor-pointer ${
                mode === m.v ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-600 hover:border-stone-950"
              }`}
            >
              {m.l}
            </button>
          ))}
        </div>

        {mode === "hours" ? (
          <div className="grid grid-cols-2 items-end gap-3">
            <label className="block text-xs text-stone-600">
              Hodin
              <input
                name="hours"
                inputMode="decimal"
                autoFocus
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="např. 4,5"
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="block text-xs text-stone-600">
              Sazba Kč/h
              <input
                name="rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            {preview != null && (
              <p className="col-span-2 text-sm text-stone-600">
                Celkem <span className="font-mono text-stone-950">{preview.toLocaleString("cs-CZ")} Kč</span>
              </p>
            )}
          </div>
        ) : (
          <label className="block text-xs text-stone-600">
            Částka Kč
            <input name="amount" inputMode="decimal" autoFocus placeholder="např. 1 250" className={`${fieldClass} mt-1`} />
          </label>
        )}

        <div className="grid grid-cols-2 items-end gap-3">
          <label className="block text-xs text-stone-600">
            Hotovo %
            <input
              name="percent"
              inputMode="numeric"
              defaultValue={percentDone || ""}
              placeholder="0–100"
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="block text-xs text-stone-600">
            Předpokl. dokončení
            <input type="date" name="expectedEnd" defaultValue={dueDate ?? ""} className={`${fieldClass} mt-1`} />
          </label>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <label className="block text-xs text-stone-600">
            Datum
            <input type="date" name="date" defaultValue={today} className={`${fieldClass} mt-1`} />
          </label>
          <label className="flex h-11 cursor-pointer items-center justify-center gap-1.5 border border-dashed border-stone-300 text-sm text-stone-600 hover:border-stone-950 sm:h-10">
            <Paperclip className="size-4" />
            {files.length ? `${files.length} ${files.length === 1 ? "příloha" : "přílohy"}` : "Přílohy / fotky"}
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
            />
          </label>
        </div>

        <label className="block text-xs text-stone-600">
          Poznámka
          <input name="description" placeholder="co se dělalo / co se koupilo" className={`${fieldClass} mt-1`} />
        </label>

        <p className="text-[11px] text-stone-400">
          Stačí vyplnit i jen % hotovo nebo předpokládané dokončení – plán se podle toho přepočítá. 100 % = hotovo.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button type="submit" disabled={busy} className="h-11 flex-1 sm:h-10">
            {busy ? "Ukládám…" : "Vykázat"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-11 sm:h-10">
            Zrušit
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
