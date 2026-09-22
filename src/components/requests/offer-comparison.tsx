"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Scale } from "lucide-react";
import { startBundleComparison, startComparison } from "@/server/actions/extraction";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import type { ComparisonResult } from "@/server/extraction";

/** Dílčí známka 0–5 jako hvězdičky. */
const znamka = (n: number) => {
  const x = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(x) + "☆".repeat(5 - x);
};

export type ComparisonView = {
  id: string;
  status: string;
  prompt: string | null;
  error: string | null;
  createdAt: string;
  result: ComparisonResult | null;
} | null;

/**
 * Porovnání nabídek – u jedné žádanky (#33), nebo za celý poptávkový
 * balíček (#40, `bundleId`). Stručný report pro výběr: srovnávací tabulka,
 * plusy a minusy, doporučení a co si ověřit. U balíčku porovnává i
 * nejlevnější jednu firmu proti nejlevnější kombinaci firem.
 */
export function OfferComparison({
  requestId,
  bundleId,
  offerCount,
  comparison,
  canRun,
}: {
  requestId?: string;
  bundleId?: string;
  offerCount: number;
  comparison: ComparisonView;
  canRun: boolean;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const running = comparison?.status === "running";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);

  if (offerCount === 0 || (!canRun && !comparison)) return null;
  const r = comparison?.status === "ready" ? comparison.result : null;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {canRun && (
          <button
            type="button"
            onClick={() => setAsk(true)}
            disabled={running}
            className="flex cursor-pointer items-center gap-1.5 border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:border-stone-950 disabled:opacity-50"
          >
            <Scale className="size-3.5" />
            {comparison ? "Porovnat znovu" : bundleId ? "Porovnat za celý balíček" : "Porovnat nabídky"}
          </button>
        )}
        {running && (
          <span className="flex items-center gap-1 text-[11px] text-stone-500">
            <Loader2 className="size-3 animate-spin" /> Porovnávám nabídky…
          </span>
        )}
        {comparison?.status === "error" && (
          <span className="text-[11px] text-red-600" title={comparison.error ?? undefined}>
            Porovnání selhalo
          </span>
        )}
        {r && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-1 text-[11px] text-stone-500 hover:text-stone-950"
          >
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Skrýt porovnání" : "Zobrazit porovnání"}
          </button>
        )}
      </div>

      {r && open && (
        <div className="mt-2 space-y-3 border border-stone-200 bg-white p-3 text-sm">
          <p className="font-medium text-stone-950">{r.headline}</p>
          <div className="-mx-3 overflow-x-auto px-3">
            <table className="w-full min-w-[480px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="py-1.5 pr-3 font-medium">{bundleId ? "Firma" : "Nabídka"}</th>
                  {r.columns.map((c, i) => (
                    <th key={i} className="py-1.5 pr-3 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row, i) => (
                  <tr key={i} className="border-b border-stone-100 align-top">
                    <td className="py-1.5 pr-3 font-medium text-stone-950">{row.offer}</td>
                    {row.cells.map((c, k) => (
                      <td key={k} className="py-1.5 pr-3 text-stone-700">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(r.scores ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="kicker">Hodnocení</p>
              {[...r.scores]
                .sort((a, b) => b.total - a.total)
                .map((sc, i) => (
                  <div key={i} className="border border-stone-200 p-2 text-xs">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-stone-950">{sc.offer}</p>
                      <p className="font-mono text-stone-950">{Math.round(sc.total)}/100</p>
                    </div>
                    <p className="mt-0.5 text-stone-600">{sc.summary}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-stone-500">
                      <span>Cena {znamka(sc.price)}</span>
                      <span>Soulad {znamka(sc.match)}</span>
                      <span>Podmínky {znamka(sc.terms)}</span>
                      <span>Úplnost {znamka(sc.completeness)}</span>
                    </div>
                    {sc.reputation && (
                      <p className="mt-1 text-[11px] text-stone-500">
                        Reference: {sc.reputation}
                        {(sc.reputationSources ?? []).length > 0 && (
                          <span className="text-stone-400"> · {sc.reputationSources.join(", ")}</span>
                        )}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {r.pros.map((p, i) => (
              <div key={i} className="border border-stone-100 p-2 text-xs">
                <p className="font-medium text-stone-900">{p.offer}</p>
                {p.pros.map((x, k) => (
                  <p key={`p${k}`} className="text-emerald-700">+ {x}</p>
                ))}
                {p.cons.map((x, k) => (
                  <p key={`c${k}`} className="text-red-700">− {x}</p>
                ))}
              </div>
            ))}
          </div>
          <p className="border-l-2 border-stone-950 pl-2 text-stone-900">{r.recommendation}</p>
          {r.questions.length > 0 && (
            <div className="text-xs text-stone-600">
              <p className="kicker mb-1">Ověřit u dodavatelů</p>
              <ul className="list-disc pl-5">
                {r.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-stone-400">
            Porovnání {new Date(comparison!.createdAt).toLocaleString("cs-CZ")}
            {comparison!.prompt ? ` · pokyn: ${comparison!.prompt}` : ""} · orientační, ceny a podmínky ověř v nabídkách
          </p>
        </div>
      )}

      {ask && (
        <Dialog title={bundleId ? "Porovnání nabídek za balíček" : "Porovnání nabídek"} size="md" onClose={() => setAsk(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                if (bundleId) await startBundleComparison(fd);
                else await startComparison(fd);
                setAsk(false);
                setOpen(true);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Nepodařilo se spustit.");
              }
              setBusy(false);
            }}
            className="space-y-3 p-5"
          >
            {bundleId ? (
              <input type="hidden" name="bundleId" value={bundleId} />
            ) : (
              <input type="hidden" name="requestId" value={requestId} />
            )}
            <p className="text-sm text-stone-600">
              Porovnám {offerCount} {offerCount === 1 ? "nabídku" : offerCount < 5 ? "nabídky" : "nabídek"} a připravím
              stručný podklad pro výběr a hodnocení každé firmy.
              {bundleId ? " Porovnám i nejlevnější jednu firmu proti nejlevnější kombinaci firem." : ""}
            </p>
            <label className="block text-xs text-stone-500">
              Na co se zaměřit (volitelné)
              <textarea
                name="prompt"
                rows={3}
                autoFocus
                defaultValue={comparison?.prompt ?? ""}
                placeholder="Např. důraz na tepelnou izolaci (Uw) a záruku; montáž musí být v ceně; rozpočet do 200 tis."
                className="mt-1 flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-700">
              <input type="checkbox" name="webSearch" value="1" defaultChecked className="size-4 cursor-pointer accent-stone-900" />
              Ověřit dodavatele na webu
            </label>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <DialogFooter>
              <button type="button" onClick={() => setAsk(false)} className="h-9 cursor-pointer px-3 text-sm text-stone-600">
                Zrušit
              </button>
              <button type="submit" disabled={busy} className="h-9 cursor-pointer bg-stone-950 px-4 text-sm text-white disabled:opacity-50">
                {busy ? "Spouštím…" : "Porovnat"}
              </button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </div>
  );
}
