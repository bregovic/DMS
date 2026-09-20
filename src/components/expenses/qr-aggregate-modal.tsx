"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  aggregateExpensesQr,
  type QrGroup,
} from "@/server/actions/qr-aggregate";
import { bulkUpdateExpenses } from "@/server/actions/expenses";
import { formatCurrency } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";

export function QrAggregateModal({
  projectId,
  ids,
  onClose,
}: {
  projectId: string;
  ids: string[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<QrGroup[]>([]);
  const [skippedPaid, setSkippedPaid] = useState(0);
  const [skippedNoBank, setSkippedNoBank] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await aggregateExpensesQr(projectId, ids);
        if (!alive) return;
        if ("error" in res) {
          setError(res.error);
        } else {
          setGroups(res.groups);
          setSkippedPaid(res.skippedPaid);
          setSkippedNoBank(res.skippedNoBank);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "QR se nepodařilo vytvořit.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, ids]);

  return (
    <Dialog title="QR platba" size="lg" onClose={onClose}>
        <div className="px-5 py-4">
          {loading ? (
            <p className="py-12 text-center text-sm text-stone-500">
              Vytvářím QR platby…
            </p>
          ) : error ? (
            <p className="py-12 text-center text-sm text-red-600">{error}</p>
          ) : (
            <div className="space-y-6">
              {groups.length > 1 && (
                <p className="text-xs text-stone-500">
                  Vybrané výdaje míří na {groups.length} různých účtů – níže je QR
                  pro každý účet zvlášť.
                </p>
              )}
              {groups.map((g, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.qr}
                    alt={`QR platba ${g.vendorName}`}
                    className="size-56"
                  />
                  <p className="mt-2 font-mono text-lg text-stone-950">
                    {formatCurrency(g.amount, g.currency)}
                  </p>
                  <p className="text-sm font-medium text-stone-950">
                    {g.vendorName}
                  </p>
                  <p className="kicker mt-0.5">
                    {g.accountLabel}
                    {g.vs ? ` · VS ${g.vs}` : ""} ·{" "}
                    {g.count === 1 ? "1 výdaj" : `${g.count} výdajů`}
                  </p>
                  {g.count > 1 && (
                    <p className="mt-1 max-w-xs text-[11px] leading-snug text-stone-400">
                      {g.titles.join(", ")}
                    </p>
                  )}
                </div>
              ))}

              {(skippedPaid > 0 || skippedNoBank.length > 0) && (
                <div className="border-t border-stone-200 pt-3 text-xs text-stone-500">
                  {skippedPaid > 0 && (
                    <p>Vynecháno {skippedPaid} už uhrazených.</p>
                  )}
                  {skippedNoBank.length > 0 && (
                    <p>
                      Bez bankovního účtu (nezahrnuto):{" "}
                      {skippedNoBank.join(", ")}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {!loading && !error && groups.length > 0 && (
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-stone-200 bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 text-sm text-stone-500 transition-colors hover:text-stone-950 cursor-pointer"
            >
              Zavřít
            </button>
            <button
              type="button"
              disabled={paying}
              onClick={async () => {
                const ids = groups.flatMap((g) => g.ids);
                if (ids.length === 0) return;
                // Pojistka: zelené tlačítko je hned vedle „Zavřít“ a označí
                // všechny výdaje v okně – ať to nejde odkliknout omylem.
                const sum = groups.reduce((a, g) => a + g.amount, 0);
                if (
                  !window.confirm(
                    `Označit ${ids.length} ${ids.length === 1 ? "výdaj" : ids.length < 5 ? "výdaje" : "výdajů"} za ${Math.round(sum).toLocaleString("cs-CZ")} Kč jako uhrazené?

QR kód si můžeš zobrazit i bez toho – stačí okno zavřít.`,
                  )
                )
                  return;
                setPaying(true);
                try {
                  const fd = new FormData();
                  fd.set("projectId", projectId);
                  fd.set("op", "paid");
                  fd.set("ids", ids.join(","));
                  await bulkUpdateExpenses(fd);
                  router.refresh();
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Nepodařilo se označit jako uhrazené.");
                  setPaying(false);
                }
              }}
              className="h-9 cursor-pointer border border-emerald-600 px-4 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white disabled:opacity-50"
            >
              {paying ? "Ukládám…" : "Zaplaceno – označit jako uhrazené"}
            </button>
          </div>
        )}
    </Dialog>
  );
}
