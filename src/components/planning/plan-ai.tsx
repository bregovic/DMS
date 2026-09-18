"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardList, Loader2, Sparkles } from "lucide-react";
import {
  applyPlanDraft,
  createRequestsFromPlan,
  dismissPlanDraft,
  getPlanDraft,
  startPlanDraft,
} from "@/server/actions/plan-ai";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

type Draft = { id: string; status: string; error: string | null } | null;
type Full = Awaited<ReturnType<typeof getPlanDraft>>;

/**
 * AI plán z dokumentace projektu (#34) + žádanky z plánu.
 *
 * 1) Vybrat dokumenty (technická zpráva, výkresy…) a případný pokyn →
 *    AI podle katalogu úkonů navrhne fáze, úkoly, dny a náklady.
 * 2) Návrh zkontrolovat a vybrané fáze založit do plánu (termíny spočítá
 *    plánovač).
 * 3) Z úkolů, u kterých plán říká „poptat“, vytvořit žádanky pro výběr
 *    dodavatelů.
 */
export function PlanAi({
  projectId,
  docs,
  draft,
  procurable,
}: {
  projectId: string;
  docs: { id: string; name: string }[];
  draft: Draft;
  procurable: number;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [review, setReview] = useState<Full | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const running = draft?.status === "running";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);

  const chip = "flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-xs transition-colors disabled:opacity-50";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <span className={`${chip} border-stone-200 text-stone-500`}>
            <Loader2 className="size-3.5 animate-spin" /> AI připravuje plán…
          </span>
        ) : draft?.status === "ready" ? (
          <button
            type="button"
            onClick={async () => setReview(await getPlanDraft(draft.id))}
            className={`${chip} border-orange-400 bg-orange-50 text-orange-800 hover:bg-orange-100`}
          >
            <Sparkles className="size-3.5" /> Návrh plánu k potvrzení
          </button>
        ) : (
          <button type="button" onClick={() => setAsk(true)} className={`${chip} border-stone-300 text-stone-700 hover:border-stone-950`}>
            <Sparkles className="size-3.5" /> Plán z dokumentace (AI)
          </button>
        )}
        {draft?.status === "error" && (
          <span className="text-xs text-red-600" title={draft.error ?? undefined}>
            Plán se nepodařil – zkus znovu
          </span>
        )}
        {procurable > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Vytvořit ${procurable} žádanek pro výběr dodavatelů z plánu?`)) return;
              setBusy(true);
              try {
                const fd = new FormData();
                fd.set("projectId", projectId);
                const r = await createRequestsFromPlan(fd);
                setMsg(`Vytvořeno ${r.created} žádanek – najdeš je v záložce Žádanky.`);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Nepodařilo se.");
              }
              setBusy(false);
            }}
            className={`${chip} border-stone-300 text-stone-700 hover:border-stone-950`}
            title="Z úkolů, u kterých plán říká, co poptat"
          >
            <ClipboardList className="size-3.5" /> Vytvořit žádanky z plánu ({procurable})
          </button>
        )}
        {msg && <span className="text-xs text-stone-600">{msg}</span>}
      </div>

      {ask && (
        <Dialog title="Plán z dokumentace (AI)" size="lg" onClose={() => setAsk(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                await startPlanDraft(fd);
                setAsk(false);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Nepodařilo se spustit.");
              }
              setBusy(false);
            }}
            className="space-y-4 p-5"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <p className="text-sm text-stone-600">
              AI projde dokumentaci, podle katalogu úkonů navrhne fáze a úkoly s odhadem dní a nákladů a co poptat
              u dodavatelů. Návrh pak zkontroluješ – nic se nezaloží samo.
            </p>
            {docs.length === 0 ? (
              <p className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                V projektu zatím není dokumentace, kterou AI přečte (PDF, fotky, Word, Excel). Nahraj ji v záložce
                Dokumenty – nebo pokračuj a plán vznikne jen z popisu a pokynu.
              </p>
            ) : (
              <fieldset className="space-y-1.5">
                <legend className="kicker mb-1">Dokumentace ({docs.length})</legend>
                {docs.slice(0, 30).map((d, i) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      name="documentIds"
                      value={d.id}
                      defaultChecked={i < 10}
                      className="size-4 accent-stone-900"
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
                <p className="text-[11px] text-stone-400">Najednou nejvýš 10 dokumentů.</p>
              </fieldset>
            )}
            <label className="block text-xs text-stone-500">
              Pokyn pro AI (volitelné)
              <textarea
                name="prompt"
                rows={3}
                placeholder="Např. garáž 6×8 m z Ytongu, plochá střecha, svépomocí zednické práce; rozpočet do 1,5 mil."
                className="mt-1 flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
              />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAsk(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Spouštím…" : "Připravit plán"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}

      {review?.result && (
        <Dialog title="Návrh plánu (AI)" size="3xl" onClose={() => setReview(null)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                await applyPlanDraft(fd);
                setReview(null);
                setMsg("Plán založen, termíny spočítané.");
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Nepodařilo se.");
              }
              setBusy(false);
            }}
            className="space-y-4 p-5"
          >
            <input type="hidden" name="id" value={review.id} />
            <p className="text-sm text-stone-800">{review.result.summary}</p>
            <p className="kicker">
              {review.result.totalCost != null && `Odhad celkem ${formatCurrency(review.result.totalCost)}`}
              {review.result.durationDays != null && ` · ${review.result.durationDays} pracovních dní`}
              {review.prompt ? ` · pokyn: ${review.prompt}` : ""}
            </p>
            {review.result.missingInfo.length > 0 && (
              <ul className="space-y-1 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {review.result.missingInfo.map((w, i) => (
                  <li key={i} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            {review.result.assumptions.length > 0 && (
              <details className="text-xs text-stone-600">
                <summary className="cursor-pointer">Předpoklady ({review.result.assumptions.length})</summary>
                <ul className="mt-1 list-disc pl-5">
                  {review.result.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="space-y-2">
              {review.result.phases.map((ph, i) => {
                const cost = ph.tasks.reduce((s, t) => s + (t.costEstimate ?? 0), 0);
                const days = ph.tasks.reduce((s, t) => s + (t.estimateDays || 0), 0);
                return (
                  <details key={i} className="border border-stone-200" open={i === 0}>
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name={`phase_${i}`}
                        value="1"
                        defaultChecked
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 accent-stone-900"
                      />
                      <span className="font-medium text-stone-950">{ph.title}</span>
                      <span className="ml-auto text-xs text-stone-500">
                        {ph.tasks.length} úkolů · {days} d{cost ? ` · ${formatCurrency(cost)}` : ""}
                      </span>
                    </summary>
                    <div className="overflow-x-auto border-t border-stone-100">
                      <table className="w-full min-w-[560px] text-xs">
                        <tbody>
                          {ph.tasks.map((t, k) => (
                            <tr key={k} className="border-b border-stone-50 align-top">
                              <td className="px-3 py-1.5 text-stone-900">
                                {t.title}
                                {t.quantity != null && (
                                  <span className="text-stone-400"> · {t.quantity} {t.unit}</span>
                                )}
                                {t.operationCode && <span className="text-stone-400"> · {t.operationCode}</span>}
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right text-stone-600">{t.estimateDays} d</td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-stone-800">
                                {t.costEstimate != null ? formatCurrency(t.costEstimate) : "?"}
                              </td>
                              <td className="px-3 py-1.5 text-stone-500">{t.procurement ? `poptat: ${t.procurement}` : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  const fd = new FormData();
                  fd.set("id", review.id);
                  await dismissPlanDraft(fd);
                  setReview(null);
                }}
              >
                Zamítnout
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setReview(null);
                  setAsk(true);
                }}
              >
                Připravit znovu
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Zakládám…" : "Založit do plánu"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
