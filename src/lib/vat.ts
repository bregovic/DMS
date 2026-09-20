/**
 * Doklady v cizí měně a DPH.
 *
 * Do přiznání i kontrolního hlášení patří částky v korunách. Doklad se ale
 * eviduje v měně, ve které je vystavený, takže se přepočítává kurzem: přednost
 * má kurz uvedený na dokladu, jinak se při vytěžení doplní kurz ČNB k DUZP.
 * Když kurz chybí, bereme částku, jak je – a je potřeba na to upozornit.
 */

export type VatRow = { rate: number; base: number; vat: number };

type Doc = {
  currency?: string | null;
  exchangeRate?: number | null;
  amount?: unknown;
  vatBase?: unknown;
  vatAmount?: unknown;
  vatBreakdown?: unknown;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Kurz dokladu (Kč za jednotku měny); 1 u korunových i u chybějícího kurzu. */
export function docRate(doc: Doc): number {
  const cur = (doc.currency ?? "CZK").toUpperCase();
  if (!cur || cur === "CZK") return 1;
  const r = num(doc.exchangeRate);
  return r > 0 ? r : 1;
}

/** Cizí měna bez kurzu – částky v přehledu DPH nesedí, je to k doplnění. */
export function rateMissing(doc: Doc): boolean {
  const cur = (doc.currency ?? "CZK").toUpperCase();
  return !!cur && cur !== "CZK" && !(num(doc.exchangeRate) > 0);
}

/** Částka dokladu v korunách. */
export function amountCzk(doc: Doc): number {
  return round2(num(doc.amount) * docRate(doc));
}

/** Rozpis DPH dokladu v korunách; bez rozpisu jeden řádek ze souhrnu. */
export function vatRowsCzk(doc: Doc, fallbackRate?: (base: number, vat: number) => number): VatRow[] {
  const rate = docRate(doc);
  const rows = (doc.vatBreakdown as VatRow[] | null) ?? [];
  const list = rows.length
    ? rows
    : [
        {
          rate: fallbackRate ? fallbackRate(num(doc.vatBase), num(doc.vatAmount)) : 0,
          base: num(doc.vatBase),
          vat: num(doc.vatAmount),
        },
      ];
  return list.map((r) => ({ rate: Number(r.rate) || 0, base: round2(num(r.base) * rate), vat: round2(num(r.vat) * rate) }));
}

/** Základ a daň dokladu v korunách (souhrnně). */
export function vatTotalsCzk(doc: Doc): { base: number; vat: number } {
  const rate = docRate(doc);
  return { base: round2(num(doc.vatBase) * rate), vat: round2(num(doc.vatAmount) * rate) };
}
