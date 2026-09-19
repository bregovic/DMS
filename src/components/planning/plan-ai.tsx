"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardList, Coins, Loader2, Sparkles } from "lucide-react";
import {
  addVendorSelectionTodos,
  applyCostDraft,
  getCostDraft,
  startCostDraft,
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
type Costs = Awaited<ReturnType<typeof getCostDraft>>;

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
  vendorSelection = 0,
  costDraft = null,
  unestimated = 0,
  openTasks = 0,
}: {
  projectId: string;
  docs: { id: string; name: string }[];
  draft: Draft;
  procurable: number;
  /** Fáze bez dodavatele a bez úkolu na jeho výběr. */
  vendorSelection?: number;
  /** Poslední AI odhad nákladů stávajícího plánu. */
  costDraft?: Draft;
  /** Nehotové úkoly bez odhadu nákladů. */
  unestimated?: number;
  /** Všechny nehotové úkoly (pro přepočet odhadů podle katalogu). */
  openTasks?: number;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [review, setReview] = useState<Full | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const running = draft?.status === "running" || costDraft?.status === "running";
  const planRunning = draft?.status === "running";
  const [costAsk, setCostAsk] = useState<false | "missing" | "all">(false);
  const [costs, setCosts] = useState<Costs | null>(null);
  // Odpovědi k otevřeným bodům návrhu plánu (index bodu → text).
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Poznámky k jednotlivým fázím a k celému plánu.
  const [phaseNotes, setPhaseNotes] = useState<Record<number, string>>({});
  const [generalNote, setGeneralNote] = useState("");
  const answered =
    Object.values(answers).filter((a) => a.trim()).length +
    Object.values(phaseNotes).filter((a) => a.trim()).length +
    (generalNote.trim() ? 1 : 0);

  // Nový návrh (po doplnění) se po dokončení sám otevře.
  const prevStatus = useRef(draft?.status);
  useEffect(() => {
    if (prevStatus.current === "running" && draft?.status === "ready") {
      getPlanDraft(draft.id).then(setReview).catch(() => {});
    }
    prevStatus.current = draft?.status;
  }, [draft?.status, draft?.id]);

  /** Otevřené body doplnit a plán připravit znovu se stejnými dokumenty. */
  async function refine() {
    if (!review?.result) return;
    const NL = String.fromCharCode(10);
    const MARK = NL + NL + "=== Úprava předchozího návrhu ===" + NL;
    const pairs = review.result.missingInfo
      .map((q, i) => ({ q, a: (answers[i] ?? "").trim() }))
      .filter((x) => x.a);
    const notes = review.result.phases
      .map((ph, i) => ({ ph: ph.title, n: (phaseNotes[i] ?? "").trim() }))
      .filter((x) => x.n);
    // Předchozí návrh stručně (fáze → úkoly), ať se upravuje, ne vymýšlí znovu.
    const prev = review.result.phases
      .map((ph) => `${ph.title}: ${ph.tasks.map((t) => `${t.title} (${t.estimateDays} d)`).join("; ")}`)
      .join(NL);
    const base = (review.prompt ?? "").split(MARK)[0];
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      for (const id of review.documentIds ?? []) fd.append("documentIds", id);
      if (review.replaceExisting) fd.set("replace", "1");
      fd.set(
        "prompt",
        base +
          MARK +
          [
            "Předchozí návrh (zachovej, co je v pořádku, a uprav podle poznámek):",
            prev,
            pairs.length ? "Doplnění k otevřeným bodům:" : "",
            ...pairs.map((x) => `- ${x.q} → ${x.a}`),
            notes.length ? "Poznámky k fázím:" : "",
            ...notes.map((x) => `- ${x.ph}: ${x.n}`),
            generalNote.trim() ? `Poznámka k celému plánu: ${generalNote.trim()}` : "",
          ]
            .filter(Boolean)
            .join(NL),
      );
      const old = new FormData();
      old.set("id", review.id);
      await dismissPlanDraft(old);
      await startPlanDraft(fd);
      setReview(null);
      setAnswers({});
      setPhaseNotes({});
      setGeneralNote("");
      setMsg("Plán se připravuje znovu podle doplnění – po dokončení se sám otevře.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nepodařilo se spustit.");
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);

  const chip = "flex h-8 cursor-pointer items-center gap-1.5 border px-2.5 text-xs transition-colors disabled:opacity-50";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {planRunning ? (
          <span className={`${chip} border-stone-200 text-stone-500`}>
            <Loader2 className="size-3.5 animate-spin" /> Připravuji plán…
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
            <Sparkles className="size-3.5" /> Plán z dokumentace
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
        {vendorSelection > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const fd = new FormData();
                fd.set("projectId", projectId);
                const r = await addVendorSelectionTodos(fd);
                setMsg(`Přidáno ${r.created} úkolů „Vybrat dodavatele“ do todo listu (3 týdny před začátkem fáze).`);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Nepodařilo se.");
              }
              setBusy(false);
            }}
            className={`${chip} border-stone-300 text-stone-700 hover:border-stone-950`}
            title="Úkol pro vlastníka ke každé fázi, která nemá dodavatele – s termínem 3 týdny před jejím začátkem"
          >
            <ClipboardList className="size-3.5" /> Doplnit výběr dodavatelů ({vendorSelection})
          </button>
        )}
        {costDraft?.status === "running" ? (
          <span className={`${chip} border-stone-200 text-stone-500`}>
            <Loader2 className="size-3.5 animate-spin" /> Odhaduji náklady…
          </span>
        ) : costDraft?.status === "ready" ? (
          <button
            type="button"
            onClick={async () => setCosts(await getCostDraft(costDraft.id))}
            className={`${chip} border-orange-400 bg-orange-50 text-orange-800 hover:bg-orange-100`}
          >
            <Coins className="size-3.5" /> Odhad nákladů k potvrzení
          </button>
        ) : (
          <>
            {unestimated > 0 && (
              <button
                type="button"
                onClick={() => setCostAsk("missing")}
                className={`${chip} border-stone-300 text-stone-700 hover:border-stone-950`}
                title="Doplní odhad nákladů úkolům, které ho nemají – promítne se do forecastu"
              >
                <Coins className="size-3.5" /> Odhadnout náklady · {unestimated}
              </button>
            )}
            {openTasks > unestimated && (
              <button
                type="button"
                onClick={() => setCostAsk("all")}
                className={`${chip} border-stone-300 text-stone-700 hover:border-stone-950`}
                title="Nově odhadne náklady všech nehotových úkolů podle aktuálních cen katalogu – změny zkontroluješ před uložením"
              >
                <Coins className="size-3.5" /> Přepočítat podle katalogu
              </button>
            )}
          </>
        )}
        {costDraft?.status === "error" && (
          <span className="text-xs text-red-600" title={costDraft.error ?? undefined}>
            Odhad se nepodařil
          </span>
        )}
        {msg && <span className="text-xs text-stone-600">{msg}</span>}
      </div>

      {costAsk && (
        <Dialog
          title={costAsk === "all" ? "Přepočet odhadů podle katalogu" : "Odhad nákladů plánu"}
          size="md"
          onClose={() => setCostAsk(false)}
        >
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                await startCostDraft(fd);
                setCostAsk(false);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Nepodařilo se spustit.");
              }
              setBusy(false);
            }}
            className="space-y-3 p-5"
          >
            <input type="hidden" name="projectId" value={projectId} />
            {costAsk === "all" && <input type="hidden" name="all" value="1" />}
            <p className="text-sm text-stone-600">
              {costAsk === "all"
                ? `Nově odhadnu náklady všech ${openTasks} nehotových úkolů podle aktuálních cen katalogu (balíčky a úkony za MJ). Uvidíš původní a nový odhad a uložíš jen to, co chceš.`
                : `Odhadnu náklady ${unestimated} úkolům bez odhadu (materiál + práce, s DPH) podle cen katalogu. Odhady pak zkontroluješ a upravíš – promítnou se do forecastu, dokud je nenahradí cena žádanky nebo nabídky.`}
            </p>
            <label className="block text-xs text-stone-500">
              Upřesnění (volitelné)
              <textarea
                name="prompt"
                rows={2}
                placeholder="Např. zednické a pomocné práce svépomocí – počítej jen materiál"
                className="mt-1 flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
              />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCostAsk(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Spouštím…" : costAsk === "all" ? "Přepočítat" : "Odhadnout"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}

      {costs && (
        <Dialog title="Odhad nákladů – ke kontrole" size="2xl" onClose={() => setCosts(null)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                const r = await applyCostDraft(fd);
                setCosts(null);
                setMsg(`Uloženo ${r.updated} odhadů – forecast je aktualizovaný.`);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Nepodařilo se.");
              }
              setBusy(false);
            }}
            className="space-y-4 p-5"
          >
            <input type="hidden" name="id" value={costs.id} />
            <p className="text-sm text-stone-800">{costs.summary}</p>
            <p className="kicker">
              Celkem {formatCurrency(costs.items.reduce((a, i) => a + (i.costEstimate ?? 0), 0))}
              {costs.recalc && ` (dosud ${formatCurrency(costs.items.reduce((a, i) => a + (i.current ?? 0), 0))})`} ·{" "}
              {costs.items.length} úkolů
            </p>
            {costs.recalc && (
              <p className="text-xs text-stone-500">
                U každého úkolu je původní odhad a návrh podle katalogu. Když chceš původní ponechat, přepiš pole na
                původní hodnotu nebo ho smaž (prázdné pole se neuloží).
              </p>
            )}
            {[...new Set(costs.items.map((i) => i.phase))].map((ph) => (
              <div key={ph} className="border border-stone-200">
                <p className="border-b border-stone-100 px-3 py-2 text-sm font-medium text-stone-950">{ph}</p>
                {costs.items
                  .filter((i) => i.phase === ph)
                  .map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-50 px-3 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 basis-48 text-stone-800">
                        {i.title}
                        {i.note && <span className="block text-[11px] text-stone-400">{i.note}</span>}
                      </span>
                      {costs.recalc && (
                        <span
                          className={`w-24 text-right font-mono text-[11px] ${
                            i.current != null && i.costEstimate != null && Math.abs(i.costEstimate - i.current) > i.current * 0.2
                              ? "text-orange-700"
                              : "text-stone-400"
                          }`}
                          title="Původní odhad"
                        >
                          {i.current != null ? formatCurrency(i.current) : "—"} →
                        </span>
                      )}
                      <input
                        name={`cost_${i.id}`}
                        inputMode="decimal"
                        defaultValue={i.costEstimate ?? ""}
                        aria-label={`Odhad nákladů – ${i.title}`}
                        className="h-8 w-28 rounded-none border border-stone-300 bg-white px-2 text-right font-mono text-xs focus-visible:border-stone-950 focus-visible:outline-none"
                      />
                      <span className="text-stone-400">Kč</span>
                    </div>
                  ))}
              </div>
            ))}
            {err && <p className="text-sm text-red-600">{err}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  const fd = new FormData();
                  fd.set("id", costs.id);
                  await dismissPlanDraft(fd);
                  setCosts(null);
                }}
              >
                Zamítnout
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Ukládám…" : "Uložit odhady"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}

      {ask && (
        <Dialog title="Plán z dokumentace" size="lg" onClose={() => setAsk(false)}>
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
              Z dokumentace a katalogu úkonů se navrhnou fáze a úkoly s odhadem dní a nákladů a co poptat
              u dodavatelů. Návrh pak zkontroluješ – nic se nezaloží samo.
            </p>
            {docs.length === 0 ? (
              <p className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                V projektu zatím není dokumentace, kterou lze zpracovat (PDF, fotky, Word, Excel). Nahraj ji v záložce
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
                      defaultChecked={i < 20}
                      className="size-4 accent-stone-900"
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
                <p className="text-[11px] text-stone-400">Najednou nejvýš 20 dokumentů – poznámky a technické zprávy jsou nahoře.</p>
              </fieldset>
            )}
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input type="checkbox" name="replace" value="1" className="mt-0.5 size-4 shrink-0 accent-stone-900" />
              <span>
                Nahradit dříve navržený plán
                <span className="block text-[11px] text-stone-400">
                  Po potvrzení se smažou nezačaté úkoly z předchozího plánu z dokumentace (bez výdajů a žádanek).
                </span>
              </span>
            </label>
            <label className="block text-xs text-stone-500">
              Upřesnění (volitelné)
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
        <Dialog title="Návrh plánu – ke kontrole" size="3xl" onClose={() => setReview(null)}>
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
              <div className="space-y-2 border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-900">
                  Otevřené body – doplň, co víš, a plán se přepočítá přesněji
                </p>
                {review.result.missingInfo.map((w, i) => (
                  <div key={i} className="space-y-1">
                    <p className="flex gap-1.5 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      {w}
                    </p>
                    <textarea
                      rows={1}
                      value={answers[i] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                      placeholder="Doplnění (volitelné) – např. rozměr, materiál, co se dělá svépomocí"
                      aria-label={`Doplnění: ${w}`}
                      className="ml-4.5 flex w-[calc(100%-1.125rem)] rounded-none border border-amber-200 bg-white px-2 py-1.5 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
                    />
                  </div>
                ))}

              </div>
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
                    <div className="border-t border-stone-100 px-3 py-2">
                      <textarea
                        rows={1}
                        value={phaseNotes[i] ?? ""}
                        onChange={(e) => setPhaseNotes((a) => ({ ...a, [i]: e.target.value }))}
                        placeholder="Poznámka k fázi – co přidat, změnit nebo vynechat"
                        aria-label={`Poznámka k fázi ${ph.title}`}
                        className="flex w-full rounded-none border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
                      />
                    </div>
                  </details>
                );
              })}
            </div>

            <div className="space-y-2 border border-stone-200 p-3">
              <label className="block text-xs text-stone-500">
                Poznámka k celému plánu
                <textarea
                  rows={2}
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="Např. chybí hrubá stavba 2. NP; rozepiš střechu po vrstvách; lepenky a hydroizolace samostatně"
                  className="mt-1 flex w-full rounded-none border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
                />
              </label>
              <Button type="button" size="sm" variant="outline" disabled={busy || answered === 0} onClick={refine}>
                Upravit plán podle doplnění a poznámek{answered ? ` (${answered})` : ""}
              </Button>
              <p className="text-[11px] text-stone-400">
                Připraví se nový návrh se stejnými dokumenty – po dokončení se sám zobrazí.
              </p>
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
