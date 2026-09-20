"use client";

import { useEffect, useState } from "react";
import { QrCode, X } from "lucide-react";
import { bulkUpdateExpenses } from "@/server/actions/expenses";
import { QrAggregateModal } from "@/components/expenses/qr-aggregate-modal";
import { PAY_FORM_ID } from "@/lib/bulk-ids";

const LIST_ID = "payment-list";

/**
 * Hromadné akce nad platbami: zaškrtnuté výdaje jde naráz označit jako
 * uhrazené, přepnout jim stav, nebo z nich složit QR platby. Výdaje tu bývají
 * z víc projektů, takže se server u každého zvlášť podívá, jestli ho smím
 * měnit. Zaškrtávátka jsou obyčejné inputy s form=PAY_FORM_ID, aby seznam
 * mohl zůstat serverový.
 */
export function PaymentsBulkBar({ statuses }: { statuses: { key: string; label: string }[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const on = picked.length > 0;

  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${PAY_FORM_ID}]`));
  const recount = () => setPicked(boxes().filter((b) => b.checked).map((b) => b.value));

  useEffect(() => {
    document.getElementById(LIST_ID)?.toggleAttribute("data-bulk", on);
  }, [on]);
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e.target as HTMLElement).getAttribute?.("form") === PAY_FORM_ID) recount();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (!msg || on) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg, on]);

  const clear = () => {
    boxes().forEach((b) => (b.checked = false));
    setPicked([]);
  };
  const all = () => {
    const bs = boxes();
    const every = bs.length > 0 && bs.every((b) => b.checked);
    bs.forEach((b) => (b.checked = !every));
    recount();
  };

  async function run(op: string, stage?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("projectId", "");
      fd.set("op", op);
      fd.set("ids", picked.join(","));
      if (stage) fd.set("stage", stage);
      await bulkUpdateExpenses(fd);
      setMsg(`Upraveno ${picked.length} ${picked.length === 1 ? "výdaj" : picked.length < 5 ? "výdaje" : "výdajů"}.`);
      clear();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Úprava selhala.");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-3 text-[11px] uppercase tracking-wide text-stone-400">
        <button type="button" onClick={all} className="cursor-pointer underline-offset-2 hover:text-stone-950 hover:underline">
          Vybrat vše
        </button>
        {on && <span className="normal-case tracking-normal text-stone-600">vybráno {picked.length}</span>}
        {msg && !on && <span className="normal-case tracking-normal text-stone-600">{msg}</span>}
      </div>

      {on && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-stone-300 bg-white/95 px-4 py-3 shadow-lift backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <span className="text-sm text-stone-600">Vybráno {picked.length}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setQrOpen(true)}
              className="inline-flex h-10 cursor-pointer items-center gap-2 border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-60"
            >
              <QrCode className="size-4" /> QR platby
            </button>
            <select
              defaultValue=""
              disabled={busy}
              aria-label="Změnit stav"
              onChange={(e) => {
                const v = e.target.value;
                e.currentTarget.value = "";
                if (v) void run("stage", v);
              }}
              className="h-10 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
            >
              <option value="">Změnit stav…</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Označit ${picked.length} výdajů jako uhrazené?`)) void run("paid");
              }}
              className="inline-flex h-10 cursor-pointer items-center border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white disabled:opacity-60"
            >
              Uhrazeno
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("unpaid")}
              className="inline-flex h-10 cursor-pointer items-center border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-60"
            >
              Zpět k úhradě
            </button>
            <button
              type="button"
              onClick={clear}
              className="ml-auto inline-flex size-10 cursor-pointer items-center justify-center text-stone-500 hover:text-stone-950"
              title="Zrušit výběr"
            >
              <X className="size-4" />
            </button>
            {msg && <span className="w-full text-xs text-stone-600">{msg}</span>}
          </div>
        </div>
      )}

      {qrOpen && <QrAggregateModal projectId="" ids={picked} onClose={() => setQrOpen(false)} />}
    </>
  );
}
