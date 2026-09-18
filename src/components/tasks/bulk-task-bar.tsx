"use client";

import { useEffect, useState } from "react";
import { ListChecks, X } from "lucide-react";
import { bulkUpdateTasks } from "@/server/actions/tasks";
import { Combobox } from "@/components/ui/combobox";

export const BULK_FORM_ID = "bulk-tasks";
const LIST_ID = "task-list";

/**
 * Hromadná úprava úkolů: tlačítko „Vybrat“ zapne zaškrtávátka v řádcích
 * a dole se objeví lišta se stavem a dodavatelem.
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
}: {
  projectId: string;
  statuses: { key: string; label: string }[];
  vendors: { id: string; name: string }[];
}) {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const boxes = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${BULK_FORM_ID}]`),
    );
  const recount = () => setCount(boxes().filter((b) => b.checked).length);

  useEffect(() => {
    document.getElementById(LIST_ID)?.toggleAttribute("data-bulk", on);
    if (!on) {
      boxes().forEach((b) => (b.checked = false));
      setCount(0);
      setMsg(null);
    }
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.getAttribute?.("form") === BULK_FORM_ID) recount();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [on]);

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
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        aria-pressed={on}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-xs transition-colors ${
          on ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-700 hover:border-stone-950"
        }`}
      >
        <ListChecks className="size-4" />
        Vybrat
      </button>

      {/* formulář existuje vždy, ať na něj zaškrtávátka mohou odkazovat */}
      <form
        key={formKey}
        id={BULK_FORM_ID}
        action={async (fd) => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await bulkUpdateTasks(fd);
            boxes().forEach((b) => (b.checked = false));
            setCount(0);
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
      >
        <input type="hidden" name="projectId" value={projectId} />
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
            <button
              type="submit"
              disabled={busy || count === 0}
              className="h-10 cursor-pointer bg-stone-950 px-4 text-sm text-white transition-colors hover:bg-stone-800 disabled:cursor-default disabled:opacity-40"
            >
              {busy ? "Ukládám…" : "Použít"}
            </button>
            <button
              type="button"
              onClick={() => setOn(false)}
              aria-label="Zavřít hromadnou úpravu"
              className="h-10 cursor-pointer px-2 text-stone-400 hover:text-stone-950"
            >
              <X className="size-4" />
            </button>
            {msg && <p className="basis-full text-xs text-stone-600">{msg}</p>}
          </div>
        </div>
      </form>
    </>
  );
}
