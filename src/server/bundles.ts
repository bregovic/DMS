import { prisma } from "@/lib/prisma";
import type { ComparisonResult } from "@/server/extraction";

/**
 * Vyhodnocení poptávkového balíčku (#40).
 *
 * Balíček sdruží žádanky, o kterých se rozhoduje společně (okna + dveře +
 * portál). Firmy odpovídají různě:
 *  - společnou nabídkou na celý balíček s jednou cenou (rozpad po žádankách
 *    nemusí být – část bez ceny znamená „tuhle žádanku kryje, cenu nerozepsala“),
 *  - společnou nabídkou s rozpadem,
 *  - samostatnými nabídkami u jednotlivých žádanek,
 *  - jen na část žádanek.
 *
 * Z toho se skládá matice firma × žádanka a dvě čísla, o která jde:
 * nejlevnější **jedna firma** na celý balíček a nejlevnější **kombinace**
 * firem po žádankách. Rozdíl mezi nimi říká, jestli se balíčková sleva vyplatí.
 */

/**
 * Balíčky projektu pro stránku Žádanky: vyhodnocení + společné nabídky
 * a poslední porovnání, rovnou ve tvaru, který čeká BundlePanel.
 */
export async function bundleViews(
  projectId: string,
  viewer: { userId: string; isManager: boolean; canWrite: boolean },
) {
  const bundles = await prisma.requestBundle.findMany({
    where: { projectId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const out = [];
  for (const { id } of bundles) {
    const ev = await evaluateBundle(id);
    if (!ev) continue;
    const [offers, comparison] = await Promise.all([
      prisma.bundleOffer.findMany({
        where: { bundleId: id },
        orderBy: [{ selected: "desc" }, { price: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          vendorId: true,
          vendorName: true,
          price: true,
          priceWithoutVat: true,
          deliveryDate: true,
          note: true,
          status: true,
          selected: true,
          createdById: true,
          vendor: { select: { name: true } },
          offers: { select: { requestId: true, price: true } },
          documents: { select: { id: true, originalName: true }, orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.offerComparison.findFirst({
        where: { bundleId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, prompt: true, error: true, createdAt: true, result: true },
      }),
    ]);
    out.push({
      ...ev,
      offers: offers.map((o) => ({
        id: o.id,
        vendorId: o.vendorId,
        vendorName: o.vendorName,
        vendorLabel: o.vendor?.name ?? o.vendorName ?? "Dodavatel neurčen",
        price: num(o.price),
        priceWithoutVat: num(o.priceWithoutVat),
        deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString().slice(0, 10) : null,
        note: o.note,
        status: o.status,
        selected: o.selected,
        canEdit: viewer.isManager || (viewer.canWrite && o.createdById === viewer.userId),
        parts: o.offers.map((p) => ({ requestId: p.requestId, price: num(p.price) })),
        docs: o.documents,
      })),
      comparison: comparison
        ? {
            ...comparison,
            createdAt: comparison.createdAt.toISOString(),
            result: comparison.result as unknown as ComparisonResult | null,
          }
        : null,
    });
  }
  return out;
}

/** Jedna buňka matice: co firma k dané žádance nabídla. */
export type BundleCell = {
  /** Cena za tuhle žádanku. null = kryje ji, ale cenu nerozepsala (nebo cena chybí). */
  price: number | null;
  /** Je žádanka nabídkou krytá? */
  covered: boolean;
  /** Přišlo to jako část společné nabídky, nebo jako samostatná nabídka? */
  source: "bundle" | "single" | null;
  offerId: string | null;
};

export type BundleVendorRow = {
  key: string;
  name: string;
  /** Celková cena společné nabídky, pokud ji firma poslala. */
  bundlePrice: number | null;
  bundleOfferId: string | null;
  /** Celkem za to, co firma kryje. null = některá krytá žádanka je bez ceny. */
  total: number | null;
  cells: Record<string, BundleCell>;
  /** Počet krytých žádanek a jestli kryje celý balíček. */
  covered: number;
  full: boolean;
  selected: boolean;
  deliveryDate: Date | null;
  note: string | null;
};

export type BundleEvaluation = {
  id: string;
  name: string;
  note: string | null;
  status: string;
  projectId: string;
  requests: { id: string; title: string; quantity: number | null; unit: string }[];
  vendors: BundleVendorRow[];
  /** Nejlevnější firma, která kryje celý balíček. */
  bestSingle: { key: string; name: string; total: number } | null;
  /** Nejlevnější kombinace po žádankách (jen z cen rozepsaných po žádankách). */
  bestCombo: {
    total: number;
    picks: { requestId: string; vendorKey: string; vendorName: string; price: number }[];
  } | null;
  /** Kolik ušetří kombinace proti jedné firmě (kladné = kombinace je levnější). */
  comboSaving: number | null;
};

const vendorKey = (vendorId: string | null, vendorName: string | null) =>
  vendorId ?? `name:${(vendorName ?? "").trim().toLowerCase()}`;

const num = (d: unknown) => (d == null ? null : Number(d));

/** Načte balíček i s nabídkami a spočítá matici a doporučení. */
export async function evaluateBundle(bundleId: string): Promise<BundleEvaluation | null> {
  const b = await prisma.requestBundle.findUnique({
    where: { id: bundleId },
    select: {
      id: true,
      name: true,
      note: true,
      status: true,
      projectId: true,
      requests: {
        select: {
          id: true,
          title: true,
          quantity: true,
          unit: true,
          offers: {
            select: {
              id: true,
              vendorId: true,
              vendorName: true,
              price: true,
              selected: true,
              status: true,
              bundleOfferId: true,
              vendor: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      offers: {
        select: {
          id: true,
          vendorId: true,
          vendorName: true,
          price: true,
          deliveryDate: true,
          note: true,
          selected: true,
          status: true,
          vendor: { select: { name: true } },
          offers: { select: { id: true, requestId: true, price: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!b) return null;
  return evaluate(b);
}

/** Tvar dat, se kterým evaluate() pracuje (viz dotaz v evaluateBundle). */
export type BundleData = {
  id: string;
  name: string;
  note: string | null;
  status: string;
  projectId: string;
  requests: {
    id: string;
    title: string;
    quantity: unknown;
    unit: string;
    offers: {
      id: string;
      vendorId: string | null;
      vendorName: string | null;
      price: unknown;
      selected: boolean;
      status: string;
      bundleOfferId: string | null;
      vendor: { name: string } | null;
    }[];
  }[];
  offers: {
    id: string;
    vendorId: string | null;
    vendorName: string | null;
    price: unknown;
    deliveryDate: Date | null;
    note: string | null;
    selected: boolean;
    status: string;
    vendor: { name: string } | null;
    offers: { id: string; requestId: string; price: unknown }[];
  }[];
};

export function evaluate(b: BundleData): BundleEvaluation {
  const requests = b.requests.map((r) => ({
    id: r.id,
    title: r.title,
    quantity: num(r.quantity),
    unit: r.unit,
  }));
  const reqIds = requests.map((r) => r.id);

  const rows = new Map<string, BundleVendorRow>();
  const row = (key: string, name: string) => {
    let x = rows.get(key);
    if (!x) {
      x = {
        key,
        name,
        bundlePrice: null,
        bundleOfferId: null,
        total: null,
        cells: {},
        covered: 0,
        full: false,
        selected: false,
        deliveryDate: null,
        note: null,
      };
      rows.set(key, x);
    }
    // Jméno z evidence dodavatelů má přednost před „Dodavatel neurčen“.
    if (x.name === "Dodavatel neurčen" && name !== x.name) x.name = name;
    return x;
  };

  // 1) Společné nabídky: celková cena + které žádanky kryjí (podle svých částí).
  for (const o of b.offers) {
    if (o.status === "odmitnuta") continue;
    const name = o.vendor?.name ?? o.vendorName ?? "Dodavatel neurčen";
    const x = row(vendorKey(o.vendorId, o.vendorName), name);
    x.bundlePrice = num(o.price);
    x.bundleOfferId = o.id;
    x.deliveryDate = o.deliveryDate;
    x.note = o.note;
    if (o.selected) x.selected = true;
    for (const part of o.offers) {
      if (!reqIds.includes(part.requestId)) continue;
      x.cells[part.requestId] = {
        price: num(part.price),
        covered: true,
        source: "bundle",
        offerId: part.id,
      };
    }
  }

  // 2) Samostatné nabídky u jednotlivých žádanek (části společné už máme výš).
  for (const r of b.requests) {
    for (const o of r.offers) {
      if (o.bundleOfferId || o.status === "odmitnuta") continue;
      const name = o.vendor?.name ?? o.vendorName ?? "Dodavatel neurčen";
      const x = row(vendorKey(o.vendorId, o.vendorName), name);
      const price = num(o.price);
      const cur = x.cells[r.id];
      // U jedné žádanky může mít firma víc nabídek – bereme vybranou, jinak nejlevnější.
      const better =
        !cur ||
        (o.selected && cur.source === "single") ||
        (cur.price == null && price != null) ||
        (cur.price != null && price != null && price < cur.price);
      if (cur?.source === "bundle") continue; // část společné nabídky má přednost
      if (better) x.cells[r.id] = { price, covered: true, source: "single", offerId: o.id };
      if (o.selected) x.selected = true;
    }
  }

  // 3) Součty a pokrytí.
  for (const x of rows.values()) {
    const covered = reqIds.filter((id) => x.cells[id]?.covered);
    x.covered = covered.length;
    x.full = covered.length === reqIds.length && reqIds.length > 0;

    const fromBundle = covered.filter((id) => x.cells[id].source === "bundle");
    const single = covered.filter((id) => x.cells[id].source === "single");
    // Společná nabídka = jedna cena za svoje části; samostatné se přičtou.
    let total: number | null = 0;
    if (fromBundle.length > 0) {
      const lump =
        x.bundlePrice ??
        (fromBundle.every((id) => x.cells[id].price != null)
          ? fromBundle.reduce((a, id) => a + (x.cells[id].price as number), 0)
          : null);
      if (lump == null) total = null;
      else total += lump;
    }
    if (total != null) {
      for (const id of single) {
        const p = x.cells[id].price;
        if (p == null) {
          total = null;
          break;
        }
        total += p;
      }
    }
    x.total = x.covered === 0 ? null : total;
  }

  const vendors = [...rows.values()].sort((a, b2) => {
    if (a.full !== b2.full) return a.full ? -1 : 1;
    if (a.total == null || b2.total == null) return a.total == null ? 1 : -1;
    return a.total - b2.total;
  });

  // Nejlevnější jedna firma na celý balíček.
  const fullOnes = vendors.filter((v) => v.full && v.total != null);
  const bestSingle = fullOnes.length
    ? (() => {
        const w = fullOnes.reduce((a, v) => (v.total! < a.total! ? v : a));
        return { key: w.key, name: w.name, total: w.total! };
      })()
    : null;

  // Nejlevnější kombinace – jen z cen rozepsaných po žádankách.
  const picks: { requestId: string; vendorKey: string; vendorName: string; price: number }[] = [];
  let comboOk = reqIds.length > 0;
  for (const id of reqIds) {
    let best: { v: BundleVendorRow; price: number } | null = null;
    for (const v of vendors) {
      const c = v.cells[id];
      if (c?.covered && c.price != null && (!best || c.price < best.price)) best = { v, price: c.price };
    }
    if (!best) {
      comboOk = false;
      break;
    }
    picks.push({ requestId: id, vendorKey: best.v.key, vendorName: best.v.name, price: best.price });
  }
  const bestCombo = comboOk ? { total: picks.reduce((a, p) => a + p.price, 0), picks } : null;

  return {
    id: b.id,
    name: b.name,
    note: b.note,
    status: b.status,
    projectId: b.projectId,
    requests,
    vendors,
    bestSingle,
    bestCombo,
    comboSaving: bestSingle && bestCombo ? bestSingle.total - bestCombo.total : null,
  };
}
