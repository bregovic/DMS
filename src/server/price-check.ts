import { prisma } from "@/lib/prisma";

/**
 * Porovnání nákupu s ceníkem katalogu (#doklady).
 *
 * Položku z faktury spáruje s materiálem katalogu podle názvu a měrné
 * jednotky a spočítá rozdíl proti ceníkové ceně. Ceny v katalogu jsou
 * s DPH, položky na faktuře bývají bez DPH – proto se sazba dopočítá.
 *
 * Slouží ke dvěma věcem: ukázat, kde jsme nakoupili dráž než za ceníkovou
 * cenu, a odhalit, že ceníková cena je vedle (soustavně nižší než trh).
 */

const STOP = new Set(["mm", "cm", "ks", "bal", "dle", "pro", "typ", "vel", "sada"]);
function tokens(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}
/** Shoda názvů 0–1: podíl společných slov k tomu kratšímu (čísla musí sedět). */
export function nameMatch(a: string, b: string) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  const numsA = [...A].filter((t) => /\d/.test(t));
  const numsB = [...B].filter((t) => /\d/.test(t));
  if (numsA.length && numsB.length && !numsA.some((t) => numsB.includes(t))) return 0;
  return hit / Math.min(A.size, B.size);
}
const UNIT_ALIAS: Record<string, string> = { kus: "ks", pcs: "ks", m2: "m2", m3: "m3", bm: "m", mb: "m", kg: "kg", t: "t", l: "l", bal: "bal", kpl: "kpl" };
const unitOf = (u: string | null | undefined) => UNIT_ALIAS[(u ?? "").toLowerCase().trim()] ?? (u ?? "").toLowerCase().trim();

export type PriceCheckRow = {
  itemId: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  paidUnit: number; // zaplacená jednotková cena s DPH
  catalogCode: string;
  catalogName: string;
  catalogPrice: number;
  diffPct: number;
  amount: number;
};

/**
 * Spáruje položky výdaje s katalogem a uloží výsledek (materialCode,
 * catalogPrice, diffPct). Vrací spárované řádky.
 */
export async function checkExpensePrices(expenseId: string): Promise<PriceCheckRow[]> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      vatAmount: true,
      vatBase: true,
      items: { orderBy: { line: "asc" }, select: { id: true, description: true, unit: true, quantity: true, unitPrice: true, amount: true, vatRate: true } },
    },
  });
  if (!expense || !expense.items.length) return [];
  const materials = await prisma.material.findMany({ select: { code: true, name: true, unit: true, unitPrice: true } });

  // sazba pro přepočet na cenu s DPH (položka nebo doklad jako celek)
  const docRate =
    expense.vatBase && Number(expense.vatBase) > 0 && expense.vatAmount != null
      ? (Number(expense.vatAmount) / Number(expense.vatBase)) * 100
      : 0;

  const rows: PriceCheckRow[] = [];
  for (const it of expense.items) {
    const qty = it.quantity != null ? Number(it.quantity) : null;
    const unitNet = it.unitPrice != null ? Number(it.unitPrice) : qty && qty > 0 ? Number(it.amount) / qty : null;
    if (!unitNet || unitNet <= 0) continue;
    const rate = it.vatRate != null ? Number(it.vatRate) : docRate;
    const paidUnit = Math.round(unitNet * (1 + rate / 100) * 100) / 100;

    let best: { code: string; name: string; price: number; score: number } | null = null;
    for (const m of materials) {
      if (unitOf(m.unit) !== unitOf(it.unit) && it.unit) continue;
      const score = nameMatch(it.description, m.name);
      if (score >= 0.6 && (!best || score > best.score)) best = { code: m.code, name: m.name, price: Number(m.unitPrice), score };
    }
    if (!best || best.price <= 0) {
      await prisma.expenseItem.update({ where: { id: it.id }, data: { materialCode: null, catalogPrice: null, diffPct: null } });
      continue;
    }
    const diffPct = Math.round(((paidUnit - best.price) / best.price) * 1000) / 10;
    await prisma.expenseItem.update({
      where: { id: it.id },
      data: { materialCode: best.code, catalogPrice: best.price, diffPct },
    });
    rows.push({
      itemId: it.id,
      description: it.description,
      unit: it.unit,
      quantity: qty,
      paidUnit,
      catalogCode: best.code,
      catalogName: best.name,
      catalogPrice: best.price,
      diffPct,
      amount: Number(it.amount),
    });
  }
  return rows;
}

/** Souhrn nákupu projektu proti ceníku (spárované položky). */
export async function projectPriceSummary(projectId: string) {
  const items = await prisma.expenseItem.findMany({
    where: { expense: { projectId }, materialCode: { not: null }, diffPct: { not: null } },
    orderBy: { diffPct: "desc" },
    select: {
      id: true,
      description: true,
      quantity: true,
      unit: true,
      unitPrice: true,
      amount: true,
      materialCode: true,
      catalogPrice: true,
      diffPct: true,
      expense: { select: { id: true, title: true, date: true, vendor: { select: { name: true } } } },
    },
  });
  if (!items.length) return null;
  // vážený průměr podle objemu položky
  const volume = items.reduce((a, i) => a + Number(i.amount), 0);
  const weighted = volume > 0 ? items.reduce((a, i) => a + Number(i.diffPct) * Number(i.amount), 0) / volume : 0;
  const over = items.filter((i) => Number(i.diffPct) > 10);
  const under = items.filter((i) => Number(i.diffPct) < -10);
  return {
    count: items.length,
    volume,
    weighted: Math.round(weighted * 10) / 10,
    over,
    under,
    items,
  };
}
