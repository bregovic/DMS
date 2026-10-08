/**
 * Bodování nabídnutých prvků (#47) – sdílené serverem i stránkou.
 * Cenu a celkové skóre počítá aplikace z čísel, ostatní známky dává rozbor.
 */

export type ScoreKey = "price" | "technical" | "reviews" | "vendor" | "terms" | "match";

/** Váhy celkového skóre. Chybějící známka se vynechá a váhy se přepočítají. */
export const SCORE_WEIGHTS: Record<ScoreKey, number> = {
  price: 30,
  technical: 20,
  reviews: 15,
  vendor: 15,
  terms: 10,
  match: 10,
};
export const SCORE_LABELS: Record<ScoreKey, string> = {
  price: "Cena",
  technical: "Technické parametry",
  reviews: "Recenze výrobku",
  vendor: "Dodavatel",
  terms: "Dodání a podmínky",
  match: "Soulad se zadáním",
};

/** Celkové skóre 0–100 z dílčích známek 0–5 (vážený průměr přes známé). */
export function totalScore(scores: Partial<Record<ScoreKey, number | null>>) {
  let w = 0;
  let sum = 0;
  for (const k of Object.keys(SCORE_WEIGHTS) as ScoreKey[]) {
    const v = scores[k];
    if (v == null || Number.isNaN(v)) continue;
    w += SCORE_WEIGHTS[k];
    sum += SCORE_WEIGHTS[k] * Math.max(0, Math.min(5, v));
  }
  return w ? Math.round((sum / w / 5) * 100) : null;
}

/**
 * Známka za cenu spočítaná z čísel, ne odhadem: nejlevnější = 5, ostatní
 * poměrem (dvojnásobná cena = 2,5). Srovnává Kč/m², když je mají všechny prvky,
 * jinak cenu prvku.
 */
export function priceScores(items: { id: string; price: number | null; perM2: number | null }[]) {
  const usePerM2 = items.every((i) => i.perM2 != null);
  const val = (i: (typeof items)[number]) => (usePerM2 ? i.perM2 : i.price);
  const known = items.map(val).filter((v): v is number => v != null && v > 0);
  const min = known.length ? Math.min(...known) : null;
  const out: Record<string, number | null> = {};
  for (const i of items) {
    const v = val(i);
    out[i.id] = min != null && v != null && v > 0 ? Math.round((5 * min) / v * 10) / 10 : null;
  }
  return out;
}
