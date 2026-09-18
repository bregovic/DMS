"use client";

import { useRef, useState } from "react";
import { Clock } from "lucide-react";
import { logTaskExpense } from "@/server/actions/my-tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

const fieldClass =
  "flex h-11 w-full rounded-none border border-stone-300 bg-white px-3 text-base text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none sm:h-10 sm:text-sm";

/**
 * Vykázání práce na úkol (#29): hodiny × sazba, nebo rovnou částka.
 *
 * Na telefonu se vyplňuje palcem na stavbě, proto velká pole, číselná
 * klávesnice a sazba předvyplněná z minula.
 */
export function LogTaskExpense({
  taskId,
  taskTitle,
  defaultRate,
}: {
  taskId: string;
  taskTitle: string;
  defaultRate: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hours" | "amount">("hours");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");
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
              await logTaskExpense(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Uložení selhalo.");
              setBusy(false);
              return;
            }
            setBusy(false);
            setHours("");
            formRef.current?.reset();
            setOpen(false);
          }}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="taskId" value={taskId} />

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
                  mode === m.v
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-300 text-stone-600 hover:border-stone-950"
                }`}
              >
                {m.l}
              </button>
            ))}
          </div>

          {mode === "hours" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-stone-600">
                Hodin
                <input
                  name="hours"
                  inputMode="decimal"
                  required
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
                  required
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
              <input
                name="amount"
                inputMode="decimal"
                required
                autoFocus
                placeholder="např. 1 250"
                className={`${fieldClass} mt-1`}
              />
            </label>
          )}

          <label className="block text-xs text-stone-600">
            Datum
            <input type="date" name="date" defaultValue={today} className={`${fieldClass} mt-1`} />
          </label>

          <label className="block text-xs text-stone-600">
            Poznámka
            <input
              name="description"
              placeholder="co se dělalo / co se koupilo"
              className={`${fieldClass} mt-1`}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={busy} className="h-11 flex-1 sm:h-10">
              {busy ? "Ukládám…" : "Vykázat"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-11 sm:h-10"
            >
              Zrušit
            </Button>
          </DialogFooter>
        </form>
    </Dialog>
  );
}
