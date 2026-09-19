import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { CatalogNav } from "@/components/catalog/catalog-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { calcOperation } from "@/lib/process-calc";
import { formatCurrency } from "@/lib/utils";

/**
 * Balíčky – sestavy úkonů „na klíč“ (např. sedlová střecha s taškou na m2).
 * Cena za 1 MJ balíčku = součet úkonů v poměru qtyPerUnit (výchozí parametry).
 * Do plánu se přidávají v dialogu „Z katalogu“ → Balíček.
 */
const REF_QTY = 100;

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = (typeof sp?.bq === "string" ? sp.bq : "").trim();
  const sortPrice = sp?.bsort === "price";
  const dir = sp?.bdir === "desc" ? -1 : 1;
  const packages = await prisma.package.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { name: "asc" },
    include: {
      items: {
        include: {
          operation: {
            include: {
              params: { orderBy: { sort: "asc" } },
              materials: { include: { material: { select: { id: true, name: true, unit: true, unitPrice: true } } } },
            },
          },
        },
      },
    },
  });

  const rows = packages.map((p) => {
    const items = p.items.map((it) => {
      const o = it.operation;
      const values: Record<string, number> = {};
      for (const pm of o.params) values[pm.key] = Number(pm.defaultValue ?? 0);
      // cena při 100 MJ balíčku přepočtená na 1 MJ – jednorázové položky (doprava, přistavení) se rozpočítají
      values.mnozstvi = Number(it.qtyPerUnit) * REF_QTY;
      const r = calcOperation(
        {
          unit: o.unit,
          quantityFormula: o.quantityFormula,
          laborFormula: o.laborFormula,
          laborRate: o.laborRate != null ? Number(o.laborRate) : null,
          params: o.params.map((x) => ({ key: x.key, defaultValue: x.defaultValue != null ? Number(x.defaultValue) : null })),
          materials: o.materials.map((m) => ({
            materialId: m.material.id,
            name: m.material.name,
            unit: m.material.unit,
            unitPrice: Number(m.material.unitPrice),
            quantityFormula: m.quantityFormula,
            wastePct: m.wastePct != null ? Number(m.wastePct) : null,
          })),
        },
        values,
      );
      r.materialCost /= REF_QTY;
      r.laborCost /= REF_QTY;
      r.laborHours /= REF_QTY;
      return { id: it.id, opId: o.id, code: o.code, name: o.name, unit: o.unit, qty: Number(it.qtyPerUnit), note: it.note, r };
    });
    const sum = (f: (x: (typeof items)[number]) => number) => items.reduce((a, x) => a + f(x), 0);
    return {
      p,
      items,
      total: sum((x) => x.r.materialCost + x.r.laborCost),
      material: sum((x) => x.r.materialCost),
      labor: sum((x) => x.r.laborCost),
      hours: sum((x) => x.r.laborHours),
    };
  });

  if (sortPrice) rows.sort((a, b) => (a.total - b.total) * dir);
  else if (dir < 0) rows.reverse();

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="display text-4xl text-stone-950">Procesní tabulky</h1>
      </header>
      <CatalogNav />

      <p className="mt-6 max-w-3xl text-sm text-stone-500">
        Balíček je sestava úkonů na 1 měrnou jednotku (m2 střechy, m2 podlahy koupelny…). V plánu ho přidáš přes „Z
        katalogu“ → Balíček a zadáš množství; úkony se pak dají upravit. Ceny za 1 MJ jsou s výchozími parametry úkonů, spočítané při 100 MJ (jednorázové položky jako doprava se rozpočítají).
      </p>

      <div className="mt-4">
        <ListFilters
          prefix="b"
          placeholder="Hledat balíček (střecha, koupelna, ETICS…)"
          dates={false}
          sortOptions={[
            { value: "name", label: "Název" },
            { value: "price", label: "Cena za MJ" },
          ]}
        />
        <p className="mt-2 text-xs text-stone-500">{rows.length} balíčků</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Žádné balíčky" description="Balíčky se zakládají importem katalogu." />
        </div>
      ) : (
        <ul className="mt-6 border-t border-stone-300/80">
          {rows.map(({ p, items, material, labor, hours }) => (
            <li key={p.id} className="border-b border-stone-200">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 py-3.5">
                  <span className="min-w-0 flex-1 basis-64">
                    <span className="font-medium text-stone-950">{p.name}</span>{" "}
                    <span className="kicker">
                      {p.code} · {items.length} úkonů
                    </span>
                    {p.note && <span className="mt-0.5 block text-xs text-stone-500">{p.note}</span>}
                  </span>
                  <span className="text-xs text-stone-500">
                    materiál {formatCurrency(material)} · práce {formatCurrency(labor)} ·{" "}
                    {hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} Nh
                  </span>
                  <span className="w-40 text-right font-mono text-stone-950">
                    {formatCurrency(material + labor)}
                    <span className="text-xs text-stone-500"> / {p.unit}</span>
                  </span>
                </summary>
                <table className="mb-4 w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-stone-500">
                      <th className="py-1.5 pr-2 font-medium">Úkon</th>
                      <th className="py-1.5 pr-2 text-right font-medium">na 1 {p.unit}</th>
                      <th className="hidden py-1.5 pr-2 text-right font-medium sm:table-cell">Materiál</th>
                      <th className="hidden py-1.5 pr-2 text-right font-medium sm:table-cell">Práce</th>
                      <th className="py-1.5 text-right font-medium">Celkem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x) => (
                      <tr key={x.id} className="border-b border-stone-100 align-top">
                        <td className="py-1.5 pr-2">
                          <Link href={`/katalog/ukony/${x.opId}`} className="text-stone-900 underline-offset-2 hover:underline">
                            {x.name}
                          </Link>{" "}
                          <span className="text-stone-400">{x.code}</span>
                          {x.note && <span className="block text-stone-500">{x.note}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                          {x.qty.toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} {x.unit}
                        </td>
                        <td className="hidden py-1.5 pr-2 text-right sm:table-cell">{formatCurrency(x.r.materialCost)}</td>
                        <td className="hidden py-1.5 pr-2 text-right sm:table-cell">{formatCurrency(x.r.laborCost)}</td>
                        <td className="py-1.5 text-right font-medium text-stone-950">
                          {formatCurrency(x.r.materialCost + x.r.laborCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
