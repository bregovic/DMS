"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { bulkUpdateTasks } from "@/server/actions/tasks";
import { Combobox } from "@/components/ui/combobox";
import { BulkLogDialog, type BulkLogTask } from "@/components/tasks/bulk-log-dialog";

import { BULK_FORM_ID } from "@/lib/bulk-ids";
const LIST_ID = "task-list";

/**
 * Hromadná úprava úkolů: zaškrtávátko v řádku úkol vybere (nesplní ho –
 * hotovo se nastavuje stavem) a jakmile je něco vybrané, dole se objeví
 * lišta se stavem, dodavatelem a vykázáním. Stejná lišta je v projektu
 * i v Moje úkoly – server u každého úkolu zvlášť ověří, co smím změnit.
 *
 * Řádky seznamu se vykreslují na serveru; zaškrtávátka jsou obyčejné
 * inputy s atributem form=BULK_FORM_ID, takže patří do formuláře v liště
 * a seznam kvůli tomu nemusí být klientská komponenta. Zobrazení
 * zaškrtávátek řídí atribut data-bulk na seznamu (CSS).
 */
export function BulkTaskBar({
  projectId,
  statuses,
  vendors,
  logTasks = [],
  defaultRate = null,
}: {
  /** Bez projektu (Moje úkoly) – úkoly můžou být z různých projektů. */
  projectId?: string;
  statuses: { key: string; label: string }[];
  /** Jen pro správce projektu; bez nich se dodavatel v liště nenabízí. */
  vendors?: { id: string; name: string }[];
  /** Úkoly, na které smím vykazovat. */
  logTasks?: BulkLogTask[];
  defaultRate?: number | null;
}) {
  const [count, setCount] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const on = count > 0;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const boxes = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${BULK_FORM_ID}]`),
    );
  const recount = () => {
    const ids = boxes().filter((b) => b.checked).map((b) => b.value);
    setCount(ids.length);
    setPicked(ids);
  };

  useEffect(() => {
    document.getElementById(LIST_ID)?.toggleAttribute("data-bulk", on);
  }, [on]);
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.getAttribute?.("form") === BULK_FORM_ID) recount();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Hláška po uložení zůstane chvíli vidět i po zmizení lišty.
  useEffect(() => {
    if (!msg || on) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg, on]);
  const clear = () => {
    boxes().forEach((b) => (b.checked = false));
    setCount(0);
    setPicked([]);
  };
  const loggable = logTasks.filter((t) => picked.includes(t.id));

  const all = () => {
    const bs = boxes();
    const allChecked = bs.length > 0 && bs.every((b) => b.checked);
    bs.forEach((b) => (b.checked = !allChecked));
    recount();
  };

  const selectClass =
    "h-10 w-full rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

  return (
    <>

      {/* formulář existuje vždy, ať na něj zaškrtávátka mohou odkazovat */}
      <form
        key={formKey}
        id={BULK_FORM_ID}
        action={async (fd) => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await bulkUpdateTasks(fd);
            clear();
            setFormKey((k) => k + 1);
            setMsg(
              `Upraveno ${r.updated} ${r.updated === 1 ? "úkol" : r.updated < 5 ? "úkoly" : "úkolů"}` +
                (r.skipped ? ` · ${r.skipped} bez oprávnění přeskočeno` : ""),
            );
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Úprava selhala.");
          }
          setBusy(false);
        }}
        className={on ? "" : "hidden"}
        onReset={() => setMsg(null)}
      >
        {projectId && <input type="hidden" name="projectId" value={projectId} />}
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-stone-300 bg-white/95 px-4 py-3 shadow-lift backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-2">
            <div className="flex basis-full items-center justify-between gap-3 text-sm sm:basis-auto sm:flex-col sm:items-start sm:gap-0">
              <span className="font-medium text-stone-950">Vybráno {count}</span>
              <button type="button" onClick={all} className="cursor-pointer text-xs text-stone-500 underline-offset-2 hover:underline">
                vybrat vše / nic
              </button>
            </div>
            <label className="min-w-36 flex-1 text-[11px] uppercase tracking-wide text-stone-400">
              Stav
              <select name="status" defaultValue="" className={`${selectClass} mt-1`}>
                <option value="">— neměnit —</option>
                {statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {vendors && (
            <div className="min-w-44 flex-1 text-[11px] uppercase tracking-wide text-stone-400">
              Dodavatel
              <div className="mt-1 normal-case tracking-normal">
                <Combobox
                  name="vendorId"
                  dropUp
                  clearOnFocus
                  emptyLabel="— neměnit —"
                  placeholder="Hledat dodavatele…"
                  items={[
                    { id: "__self", label: "Svépomocí (bez dodavatele)" },
                    { id: "__none", label: "Odebrat dodavatele" },
                    ...vendors.map((v) => ({ id: v.id, label: v.name })),
                  ]}
                />
              </div>
            </div>
            )}
            <button
              type="submit"
              disabled={busy || count === 0}
              className="h-10 cursor-pointer bg-stone-950 px-4 text-sm text-white transition-colors hover:bg-stone-800 disabled:cursor-default disabled:opacity-40"
            >
              {busy ? "Ukládám…" : "Použít"}
            </button>
            {loggable.length > 0 && (
              <button
                type="button"
                onClick={() => setLogOpen(true)}
                className="flex h-10 cursor-pointer items-center gap-1.5 border border-stone-950 px-3 text-sm text-stone-950 transition-colors hover:bg-stone-100"
              >
                <Clock className="size-4" /> Vykázat
              </button>
            )}
            <button
              type="button"
              onClick={clear}
              aria-label="Zrušit výběr"
              className="h-10 cursor-pointer px-2 text-stone-400 hover:text-stone-950"
            >
              <X className="size-4" />
            </button>
            {msg && <p className="basis-full text-xs text-stone-600">{msg}</p>}
          </div>
        </div>
      </form>
      {logOpen && (
        <BulkLogDialog
          tasks={loggable}
          defaultRate={defaultRate}
          onClose={() => setLogOpen(false)}
          onDone={(m) => {
            setLogOpen(false);
            clear();
            setMsg(m);
          }}
        />
      )}
      {!on && msg && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 bg-stone-950 px-3 py-2 text-xs text-white shadow-lift md:bottom-4">
          {msg}
        </div>
      )}
    </>
  );
}
