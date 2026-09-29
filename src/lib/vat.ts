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

/**
 * Sazba dopočtená z poměru daně a základu – použije se u dokladu, který nemá
 * uložený rozpis po sazbách (starší doklady, ruční zápis). Sedí-li poměr na
 * zákonnou sazbu, vezme se ta; jinak se vrátí, co doklad opravdu říká, ať je
 * v přehledu vidět, že je něco divně.
 */
export function impliedRate(base: number, vat: number): number {
  if (!(vat > 0) || !(base > 0)) return 0;
  const r = (vat / base) * 100;
  for (const legal of [21, 12]) if (Math.abs(r - legal) <= 1.5) return legal;
  return Math.round(r * 10) / 10;
}

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

/**
 * Rozpis DPH dokladu v korunách. Když doklad rozpis nemá, vznikne jeden řádek
 * ze souhrnu a sazba se dopočítá z poměru daně a základu (dřív padal do 0 %,
 * takže se doklad v přehledu tvářil jako osvobozený).
 */
export function vatRowsCzk(doc: Doc): VatRow[] {
  const rate = docRate(doc);
  const rows = (doc.vatBreakdown as VatRow[] | null) ?? [];
  const list = rows.length
    ? rows
    : [
        {
          rate: impliedRate(num(doc.vatBase), num(doc.vatAmount)),
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

export type ClaimItem = { amount: unknown; vatRate?: unknown; deductible?: boolean };

/**
 * Rozpis DPH zúžený na položky, které jdou do přiznání.
 *
 * Nepřepočítává se z položek, ale krátí se rekapitulace dokladu podílem, který
 * na sazbu připadá z odškrtnutých položek. Dvě věci se tím řeší najednou:
 * zůstane zaokrouhlení dokladu (u plného nároku vyjdou čísla na haléř stejně
 * jako dřív) a je jedno, jestli jsou částky položek s DPH nebo bez – podíl
 * uvnitř jedné sazby vyjde stejně.
 *
 * Položka bez sazby se přiřadí k jediné sazbě dokladu; při víc sazbách ji
 * přiřadit nelze a na nárok nemá vliv.
 */
export function claimedVatRows(rows: VatRow[], items: ClaimItem[]): VatRow[] {
  if (!rows.length || !items.length || items.every((i) => i.deductible !== false)) return rows;
  const rateOf = (i: ClaimItem) => {
    const r = i.vatRate == null ? null : Number(i.vatRate);
    if (r != null && Number.isFinite(r)) {
      const hit = rows.find((x) => Math.abs(Number(x.rate) - r) < 0.01);
      if (hit) return Number(hit.rate);
    }
    return rows.length === 1 ? Number(rows[0].rate) : null;
  };
  const all = new Map<number, number>();
  const keep = new Map<number, number>();
  for (const i of items) {
    const r = rateOf(i);
    if (r == null) continue;
    const a = Math.abs(num(i.amount));
    all.set(r, (all.get(r) ?? 0) + a);
    if (i.deductible !== false) keep.set(r, (keep.get(r) ?? 0) + a);
  }
  return rows
    .map((row) => {
      const total = all.get(Number(row.rate)) ?? 0;
      if (total <= 0) return row; // sazba bez rozpoznaných položek zůstává celá
      const f = Math.min(1, Math.max(0, (keep.get(Number(row.rate)) ?? 0) / total));
      return { rate: Number(row.rate), base: round2(num(row.base) * f), vat: round2(num(row.vat) * f) };
    })
    .filter((r) => r.base || r.vat);
}

/** Základ a daň po zúžení na položky, které jdou do přiznání. */
export function claimedTotals(rows: VatRow[], items: ClaimItem[]): { base: number; vat: number; rows: VatRow[] } {
  const list = claimedVatRows(rows, items);
  return {
    rows: list,
    base: round2(list.reduce((a, r) => a + num(r.base), 0)),
    vat: round2(list.reduce((a, r) => a + num(r.vat), 0)),
  };
}
