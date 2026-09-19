"use client";

import { useState, useTransition } from "react";
import { setMyTaskProgress } from "@/server/actions/my-tasks";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STEPS = [0, 25, 50, 75, 100];

/**
 * Průběh úkolu: v řádku malý pruh s %, klik otevře dialog s velkým
 * posuvníkem (dobře se tahá palcem), rychlými kroky a předpokládaným
 * dokončením. 100 % = hotovo; změna % nebo termínu přepočítá plán.
 */
export function TaskProgressInput({
  taskId,
  percent,
  title,
  dueDate = null,
}: {
  taskId: string;
  percent: number;
  title?: string;
  dueDate?: string | null; // YYYY-MM-DD
}) {
  const cur = percent || 0;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(cur);
  const [end, setEnd] = useState(dueDate ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = () => {
    setV(cur);
    setEnd(dueDate ?? "");
    setErr(null);
    setOpen(true);
  };
  const save = () => {
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("percent", String(v));
    fd.set("pct_orig", String(cur));
    fd.set("expectedEnd", end);
    fd.set("due_orig", dueDate ?? "");
    start(async () => {
      try {
        await setMyTaskProgress(fd);
        setOpen(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Uložení se nepodařilo.");
      }
    });
  };

  const barCls = (p: number) => (p >= 100 ? "bg-emerald-600" : p > 0 ? "bg-stone-900" : "bg-stone-300");

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={pending}
        title="Upravit průběh"
        aria-label={`Průběh ${cur} % – upravit`}
        className="flex h-7 cursor-pointer items-center gap-2 border border-stone-300 bg-white px-2 text-xs text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-50"
      >
        <span className="relative h-1.5 w-14 overflow-hidden bg-stone-200">
          <span className={`absolute inset-y-0 left-0 ${barCls(cur)}`} style={{ width: `${cur}%` }} />
        </span>
        <span className="w-8 text-right tabular-nums">{cur} %</span>
      </button>

      {open && (
        <Dialog title={title ? `Průběh · ${title}` : "Průběh úkolu"} size="md" onClose={() => setOpen(false)}>
          <div className="space-y-6 p-5">
            <div className="text-center">
              <p className={`display text-6xl tabular-nums ${v >= 100 ? "text-emerald-700" : "text-stone-950"}`}>{v} %</p>
              <p className="kicker mt-1">{v >= 100 ? "hotovo" : v === 0 ? "nezačato" : "rozpracováno"}</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setV((x) => Math.max(0, x - 5))}
                className="h-11 w-12 shrink-0 cursor-pointer border border-stone-300 text-lg hover:border-stone-950"
                aria-label="Ubrat 5 %"
              >
                −
              </button>
              <div className="relative h-10 flex-1">
                <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden bg-stone-200">
                  <div className={`h-full transition-[width] ${barCls(v)}`} style={{ width: `${v}%` }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={v}
                  onChange={(e) => setV(Number(e.target.value))}
                  aria-label="Hotovo %"
                  className="progress-range absolute inset-0 h-10 w-full cursor-pointer appearance-none bg-transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => setV((x) => Math.min(100, x + 5))}
                className="h-11 w-12 shrink-0 cursor-pointer border border-stone-300 text-lg hover:border-stone-950"
                aria-label="Přidat 5 %"
              >
                +
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setV(s)}
                  className={`h-11 cursor-pointer border text-sm tabular-nums transition-colors ${
                    v === s ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-700 hover:border-stone-950"
                  }`}
                >
                  {s === 100 ? "Hotovo" : `${s} %`}
                </button>
              ))}
            </div>

            <label className="block text-xs text-stone-600">
              Předpokládané dokončení
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 flex h-11 w-full rounded-none border border-stone-300 bg-white px-3 text-base text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none sm:h-10 sm:text-sm"
              />
            </label>
            <p className="text-[11px] text-stone-400">
              100 % označí úkol jako hotový. Změna průběhu nebo termínu přepočítá navazující plán.
            </p>
            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="button" onClick={save} disabled={pending || (v === cur && end === (dueDate ?? ""))}>
              {pending ? "Ukládám…" : "Uložit"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
}
