"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  aggregateExpensesQr,
  type QrGroup,
} from "@/server/actions/qr-aggregate";
import { bulkUpdateExpenses } from "@/server/actions/expenses";
import { formatCurrency } from "@/lib/utils";

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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5">
          <h2 className="text-sm font-medium text-stone-950">QR platba</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 transition-colors hover:text-stone-950 cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
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
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
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
              className="h-9 border border-emerald-600 bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {paying ? "Ukládám…" : "Potvrdit úhradu (uhrazeno)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
