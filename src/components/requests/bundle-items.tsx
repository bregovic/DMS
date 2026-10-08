"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ListTree, Loader2, Search } from "lucide-react";
import { startBundleItems, startItemReview, startOfferItems } from "@/server/actions/offer-items";
import type { ItemReviewResult, ItemReviewView, ItemView, ItemsInfo } from "@/server/offer-items";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { chybaAkce } from "@/lib/chyba-akce";
import { formatCurrency } from "@/lib/utils";
import { SCORE_LABELS, SCORE_WEIGHTS, totalScore, type ScoreKey } from "@/lib/offer-scores";

export type BundleItemsData = {
  byRequest: Record<string, ItemView[]>;
  shared: ItemView[];
  reviewByRequest: Record<string, ItemReviewView>;
};

export type OfferItemsState = {
  id: string;
  itemsStatus: string | null;
  itemsError: string | null;
  itemsInfo: ItemsInfo | null;
  itemCount: number;
};

const smallBtn =
  "inline-flex cursor-pointer items-center gap-1 border border-stone-300 bg-white px-2 py-1 text-[11px] text-stone-700 hover:border-stone-950 disabled:cursor-default disabled:opacity-50";

/** Překreslovat, dokud něco běží na pozadí. */
function useRefreshWhile(running: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);
}

/** Stav rozpisu u jedné nabídky + tlačítko. */
export function OfferItemsStatus({ offer, canRun }: { offer: OfferItemsState; canRun: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const running = offer.itemsStatus === "running";
  useRefreshWhile(running);
  const info = offer.itemsInfo;

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("id", offer.id);
      await startOfferItems(fd);
    } catch (e) {
      setErr(chybaAkce(e, "Rozpis nejde spustit."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      {running ? (
        <span className="inline-flex items-center gap-1 text-stone-500">
          <Loader2 className="size-3 animate-spin" /> Rozepisuji položky…
        </span>
      ) : offer.itemsStatus === "ready" && info ? (
        <>
          <button type="button" onClick={() => setOpen((x) => !x)} className="cursor-pointer text-stone-500 hover:text-stone-950">
            {offer.itemCount} položek
            {info.diff != null &&
              (info.warnings.length && !info.partsFilled ? (
                <span className="text-orange-700"> · součet nesedí o {formatCurrency(Math.abs(info.diff))}</span>
              ) : (
                <span className="text-emerald-700"> · součet sedí</span>
              ))}
            <ChevronDown className={`ml-0.5 inline size-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {canRun && (
            <button type="button" onClick={run} disabled={busy} className="cursor-pointer text-stone-400 underline-offset-2 hover:text-stone-950 hover:underline">
              rozepsat znovu
            </button>
          )}
        </>
      ) : (
        canRun && (
          <button type="button" onClick={run} disabled={busy} className={smallBtn}>
            <ListTree className="size-3" />
            Rozepsat položky
          </button>
        )
      )}
      {offer.itemsStatus === "error" && offer.itemsError && <span className="text-red-700">{offer.itemsError}</span>}
      {err && <span className="text-red-700">{err}</span>}
      {open && info && (
        <span className="block basis-full text-stone-600">
          {info.summary}
          {info.terms && (
            <span className="mt-0.5 block">
              {[
                info.terms.leadTime && `Dodání: ${info.terms.leadTime}`,
                info.terms.warranty && `Záruka: ${info.terms.warranty}`,
                info.terms.paymentTerms && `Platba: ${info.terms.paymentTerms}`,
                info.terms.included.length > 0 && `V ceně: ${info.terms.included.join(", ")}`,
                info.terms.excluded.length > 0 && `Není v ceně: ${info.terms.excluded.join(", ")}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {info.warnings.map((w, i) => (
            <span key={i} className="block text-orange-700">
              {w}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

const fmtDim = (i: ItemView) => (i.widthMm && i.heightMm ? `${i.widthMm} × ${i.heightMm}` : "—");
const fmtQty = (i: ItemView) => (i.quantity != null && i.quantity !== 1 ? `${i.quantity} ${i.unit ?? "ks"}` : null);
const byPrice = (a: ItemView, b: ItemView) => (a.priceWithVat ?? Infinity) - (b.priceWithVat ?? Infinity);

/** Klíčové parametry do řádku – zbytek je v rozbalení. */
const KEY_SPECS = ["uw", "profil", "zasklení", "ug", "práh", "kování"];
function keySpecs(i: ItemView) {
  const picked = i.specs
    .filter((s) => KEY_SPECS.some((k) => s.label.toLowerCase().includes(k)))
    .slice(0, 3);
  return (picked.length ? picked : i.specs.slice(0, 2)).map((s) => `${s.label} ${s.value}`).join(" · ");
}

function ItemRow({
  item,
  review,
  cheapest,
  withScore,
  best,
}: {
  withScore: boolean;
  best: boolean;
  item: ItemView;
  review?: ItemReviewResult["items"][number];
  cheapest: boolean;
}) {
  const [open, setOpen] = useState(false);
  const muted = item.kind !== "product";
  const total = review ? (review.total ?? totalScore(review.scores ?? {})) : null;
  return (
    <Fragment>
      <tr
        onClick={() => setOpen((x) => !x)}
        className={`cursor-pointer border-b border-stone-100 align-top hover:bg-stone-50 ${item.selectedOffer ? "bg-emerald-50/70" : ""}`}
      >
        <td className="py-1.5 pr-3 font-medium text-stone-950">
          {item.vendor}
          {item.alternative && (
            <span className="ml-1.5 border border-stone-300 px-1 text-[10px] font-normal text-stone-500" title={item.alternative}>
              alternativa
            </span>
          )}
        </td>
        <td className={`py-1.5 pr-3 ${muted ? "text-stone-500" : "text-stone-900"}`}>
          {item.title}
          {item.product && <span className="block text-[11px] text-stone-500">{item.product}</span>}
          {item.alternative && <span className="block text-[11px] text-stone-400">{item.alternative}</span>}
        </td>
        <td className="py-1.5 pr-3 whitespace-nowrap text-stone-700">
          {fmtDim(item)}
          {fmtQty(item) && <span className="block text-[11px] text-stone-400">{fmtQty(item)}</span>}
          {item.mismatch && <span className="block text-[11px] text-orange-700">≠ zadání</span>}
        </td>
        <td className="hidden py-1.5 pr-3 text-[11px] text-stone-600 md:table-cell">{keySpecs(item)}</td>
        <td className={`py-1.5 pr-3 text-right font-mono whitespace-nowrap ${cheapest ? "text-emerald-700" : "text-stone-950"}`}>
          {item.priceWithVat != null ? formatCurrency(item.priceWithVat) : <span className="text-stone-400">?</span>}
        </td>
        <td className="py-1.5 pr-1 text-right font-mono whitespace-nowrap text-stone-500">
          {item.perM2 != null ? formatCurrency(item.perM2) : ""}
        </td>
        {withScore && (
          <td className="py-1.5 pl-2 pr-1 text-right whitespace-nowrap">
            {total != null ? (
              <span className={`font-mono font-medium ${best ? "text-emerald-700" : "text-stone-950"}`}>{total}</span>
            ) : (
              <span className="text-stone-300">—</span>
            )}
          </td>
        )}
      </tr>
      {open && (
        <tr className="border-b border-stone-100 bg-stone-50/60">
          <td colSpan={withScore ? 7 : 6} className="px-2 py-2 text-[11px] text-stone-700">
            {item.specs.length > 0 && (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                {item.specs.map((s, i) => (
                  <div key={i} className="flex gap-1.5">
                    <dt className="text-stone-500">{s.label}:</dt>
                    <dd className="text-stone-900">{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {item.description && <p className="mt-1">{item.description}</p>}
            {item.mismatch && <p className="mt-1 text-orange-700">{item.mismatch}</p>}
            {item.priceWithoutVat != null && (
              <p className="mt-1 text-stone-500">
                Bez DPH {formatCurrency(item.priceWithoutVat)}
                {item.position ? ` · pozice ${item.position}` : ""}
              </p>
            )}
            {review && (
              <div className="mt-2 border-t border-stone-200 pt-2">
                <p className="text-stone-900">{review.verdict}</p>
                {review.scores && (
                  <table className="mt-1.5 border-collapse">
                    <tbody>
                      {(Object.keys(SCORE_LABELS) as ScoreKey[]).map((k) => {
                        const v = review.scores[k];
                        return (
                          <tr key={k} className="align-top">
                            <td className="py-0.5 pr-3 whitespace-nowrap text-stone-500">
                              {SCORE_LABELS[k]} <span className="text-stone-300">{SCORE_WEIGHTS[k]} %</span>
                            </td>
                            <td className="py-0.5 pr-3 whitespace-nowrap font-mono text-stone-900">
                              {v != null ? `${Math.round(v * 10) / 10}/5` : "—"}
                            </td>
                            <td className="py-0.5 text-stone-600">
                              {k === "price" ? (item.perM2 != null ? "podle Kč/m²" : "podle ceny") : review.scoreNotes?.[k]}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {(review.pros.length > 0 || review.cons.length > 0) && (
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <ul className="space-y-0.5">
                      {review.pros.map((p, i) => (
                        <li key={i} className="text-emerald-800">+ {p}</li>
                      ))}
                    </ul>
                    <ul className="space-y-0.5">
                      {review.cons.map((p, i) => (
                        <li key={i} className="text-red-800">− {p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-1">
                  <span className="text-stone-500">Zkušenosti: </span>
                  {review.reviews}
                  {review.sources.length > 0 && <span className="text-stone-400"> ({review.sources.join(", ")})</span>}
                </p>
                {review.priceNote && (
                  <p className="mt-0.5">
                    <span className="text-stone-500">Cena: </span>
                    {review.priceNote}
                  </p>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function ItemTable({
  items,
  review,
}: {
  items: ItemView[];
  review?: ItemReviewResult | null;
}) {
  const [sort, setSort] = useState<"price" | "score">("score");
  const minPrice = Math.min(...items.filter((i) => !i.alternative && i.kind === "product" && i.priceWithVat != null).map((i) => i.priceWithVat!));
  const reviewOf = (id: string) => review?.items.find((x) => x.ref === id);
  const scoreOf = (id: string) => {
    const r = reviewOf(id);
    return r ? (r.total ?? totalScore(r.scores ?? {})) : null;
  };
  const withScore = !!review && items.some((i) => scoreOf(i.id) != null);
  const bestScore = withScore ? Math.max(...items.map((i) => scoreOf(i.id) ?? -1)) : null;
  const rows =
    withScore && sort === "score" ? [...items].sort((a, b) => (scoreOf(b.id) ?? -1) - (scoreOf(a.id) ?? -1)) : items;
  const sortBtn = (k: "price" | "score", label: string) => (
    <button
      type="button"
      onClick={() => setSort(k)}
      className={`cursor-pointer ${sort === k ? "font-medium text-stone-950" : "text-stone-400 hover:text-stone-950"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="hscroll -mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[620px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-stone-300 text-left text-stone-500">
            <th className="py-1.5 pr-3 font-medium">Firma</th>
            <th className="py-1.5 pr-3 font-medium">Prvek</th>
            <th className="py-1.5 pr-3 font-medium">Rozměr (mm)</th>
            <th className="hidden py-1.5 pr-3 font-medium md:table-cell">Parametry</th>
            <th className="py-1.5 pr-3 text-right font-medium">S DPH</th>
            <th className="py-1.5 pr-1 text-right font-medium">{withScore ? sortBtn("price", "Kč/m²") : "Kč/m²"}</th>
            {withScore && <th className="py-1.5 pl-2 pr-1 text-right font-medium">{sortBtn("score", "Skóre")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              cheapest={i.kind === "product" && i.priceWithVat === minPrice}
              review={reviewOf(i.id)}
              withScore={withScore}
              best={bestScore != null && scoreOf(i.id) === bestScore}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewDialog({ requestId, title, onClose }: { requestId: string; title: string; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={`Rozbor výrobků – ${title}`} size="md" onClose={onClose}>
      <form
        action={async (fd) => {
          setBusy(true);
          setErr(null);
          try {
            await startItemReview(fd);
            onClose();
          } catch (e) {
            setErr(chybaAkce(e, "Rozbor nejde spustit."));
            setBusy(false);
          }
        }}
        className="space-y-3 p-5"
      >
        <input type="hidden" name="requestId" value={requestId} />
        <label className="block space-y-1.5 text-sm">
          <span className="text-stone-700">Na co se zaměřit</span>
          <textarea
            name="prompt"
            rows={3}
            placeholder="Např. tepelná izolace, bezbariérový práh, spolehlivost kování"
            className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none"
          />
        </label>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Spouštím…" : "Rozebrat"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** Jedna žádanka: všechny nabídnuté prvky ze všech nabídek + rozbor. */
function RequestItems({
  request,
  items,
  review,
  canRun,
}: {
  request: { id: string; title: string };
  items: ItemView[];
  review: ItemReviewView;
  canRun: boolean;
}) {
  const [ask, setAsk] = useState(false);
  const [showAcc, setShowAcc] = useState(false);
  const running = review?.status === "running";
  useRefreshWhile(running);
  const products = items.filter((i) => i.kind === "product").sort(byPrice);
  const other = items.filter((i) => i.kind !== "product").sort(byPrice);
  const r = review?.status === "ready" ? review.result : null;

  return (
    <div className="mt-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-stone-950">
          {request.title}
          <span className="ml-1.5 text-xs font-normal text-stone-400">
            {products.length} {products.length === 1 ? "prvek" : products.length < 5 ? "prvky" : "prvků"}
          </span>
        </h4>
        <span className="flex items-center gap-2">
          {running && (
            <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
              <Loader2 className="size-3 animate-spin" /> Rozebírám výrobky…
            </span>
          )}
          {canRun && products.length > 0 && (
            <button type="button" onClick={() => setAsk(true)} disabled={running} className={smallBtn}>
              <Search className="size-3" />
              {r ? "Rozebrat znovu" : "Rozebrat výrobky"}
            </button>
          )}
        </span>
      </div>
      {products.length ? (
        <ItemTable items={products} review={r} />
      ) : (
        <p className="text-xs text-stone-500">Žádný rozepsaný prvek.</p>
      )}
      {other.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAcc((x) => !x)}
            className="mt-1 cursor-pointer text-[11px] text-stone-500 hover:text-stone-950"
          >
            Příslušenství a příplatky · {other.length}
            <ChevronDown className={`ml-0.5 inline size-3 transition-transform ${showAcc ? "rotate-180" : ""}`} />
          </button>
          {showAcc && <ItemTable items={other} />}
        </>
      )}
      {review?.status === "error" && review.error && <p className="mt-1 text-[11px] text-red-700">{review.error}</p>}
      {r && (
        <div className="mt-2 border border-stone-200 bg-white p-3 text-xs text-stone-700">
          <p className="font-medium text-stone-950">{r.headline}</p>
          <p className="mt-1">{r.recommendation}</p>
          {r.questions.length > 0 && (
            <>
              <p className="kicker mt-2">Ověřit před objednáním</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {r.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-[11px] text-stone-400">Podrobnosti k výrobku po kliknutí na řádek.</p>
        </div>
      )}
      {ask && <ReviewDialog requestId={request.id} title={request.title} onClose={() => setAsk(false)} />}
    </div>
  );
}

/**
 * Porovnání po prvcích (#47): pod každou žádankou balíčku všechny nabídnuté
 * prvky ze všech nabídek včetně alternativ, s parametry a cenou za m².
 */
export function BundleItems({
  bundleId,
  requests,
  data,
  offers,
  canRun,
}: {
  bundleId: string;
  requests: { id: string; title: string }[];
  data: BundleItemsData;
  offers: OfferItemsState[];
  canRun: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showShared, setShowShared] = useState(false);
  const pending = offers.filter((o) => o.itemsStatus == null || o.itemsStatus === "error").length;
  const running = offers.some((o) => o.itemsStatus === "running");
  const anyItems = Object.keys(data.byRequest).length > 0 || data.shared.length > 0;
  if (!offers.length || (!anyItems && !canRun)) return null;

  return (
    <div className="mt-4 border-t border-stone-200 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="kicker">Po prvcích</p>
        <span className="flex items-center gap-2">
          {running && (
            <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
              <Loader2 className="size-3 animate-spin" /> Rozepisuji nabídky…
            </span>
          )}
          {canRun && pending > 0 && (
            <form
              action={async (fd) => {
                setBusy(true);
                setErr(null);
                try {
                  await startBundleItems(fd);
                } catch (e) {
                  setErr(chybaAkce(e, "Rozpis nejde spustit."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input type="hidden" name="bundleId" value={bundleId} />
              <button type="submit" disabled={busy} className={smallBtn}>
                <ListTree className="size-3" />
                Rozepsat {pending === offers.length ? "všechny nabídky" : `zbývající nabídky (${pending})`}
              </button>
            </form>
          )}
        </span>
      </div>
      {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
      {!anyItems ? (
        !running && <p className="mt-1 text-xs text-stone-500">Nabídky zatím nejsou rozepsané po položkách.</p>
      ) : (
        <>
          {requests.map((r) => (
            <RequestItems
              key={r.id}
              request={r}
              items={data.byRequest[r.id] ?? []}
              review={data.reviewByRequest[r.id] ?? null}
              canRun={canRun}
            />
          ))}
          {data.shared.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowShared((x) => !x)}
                className="cursor-pointer text-sm font-medium text-stone-950"
              >
                Montáž, doprava a ostatní
                <span className="ml-1.5 text-xs font-normal text-stone-400">{data.shared.length}</span>
                <ChevronDown className={`ml-0.5 inline size-3.5 transition-transform ${showShared ? "rotate-180" : ""}`} />
              </button>
              {showShared && (
                <ItemTable items={[...data.shared].sort((a, b) => a.vendor.localeCompare(b.vendor, "cs") || byPrice(a, b))} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
