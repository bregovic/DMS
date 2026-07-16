import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { CatalogNav } from "@/components/catalog/catalog-nav";
import { MaterialForm } from "@/components/catalog/material-form";
import { ListFilters } from "@/components/ui/list-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteMaterial } from "@/server/actions/process-tables";
import { formatCurrency } from "@/lib/utils";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = (typeof sp?.mq === "string" ? sp.mq : "").trim().toLowerCase();
  const cat = typeof sp?.mcat === "string" ? sp.mcat : "";
  const sort = sp?.msort === "code" ? "code" : "name";
  const dir = sp?.mdir === "desc" ? "desc" : "asc";

  const all = await prisma.material.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { recipes: true } } },
  });
  const categories = [...new Set(all.map((m) => m.category).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "cs"),
  );

  let materials = all;
  if (q)
    materials = materials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q),
    );
  if (cat) materials = materials.filter((m) => m.category === cat);
  const sign = dir === "asc" ? 1 : -1;
  materials = [...materials].sort(
    (a, b) =>
      (sort === "code"
        ? a.code.localeCompare(b.code, "cs")
        : a.name.localeCompare(b.name, "cs")) * sign,
  );
  const filterActive = Boolean(q || cat);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <h1 className="display text-4xl text-stone-950">Procesní tabulky</h1>
        <MaterialForm />
      </header>

      <CatalogNav />

      {all.length === 0 ? (
        <EmptyState
          title="Zatím žádné materiály"
          description="Přidej první tlačítkem výše, nebo je později naimportuj z CSV."
        />
      ) : (
        <div className="mt-6">
          <ListFilters
            prefix="m"
            placeholder="Hledat kód / název…"
            sortOptions={[
              { value: "name", label: "Název" },
              { value: "code", label: "Kód" },
            ]}
            selects={
              categories.length
                ? [
                    {
                      key: "cat",
                      label: "Kategorie",
                      options: categories.map((c) => ({ value: c, label: c })),
                    },
                  ]
                : []
            }
          />
          <p className="mb-3 text-xs text-stone-500">
            {materials.length}
            {filterActive ? ` z ${all.length}` : ""} materiálů
          </p>
          {materials.length === 0 ? (
            <EmptyState title="Nic neodpovídá filtru" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500">
                    <th className="hidden py-2 pr-4 font-normal kicker sm:table-cell">Kód</th>
                    <th className="py-2 pr-4 font-normal kicker">Název</th>
                    <th className="hidden py-2 pr-4 font-normal kicker md:table-cell">Kategorie</th>
                    <th className="hidden py-2 pr-4 text-right font-normal kicker sm:table-cell">MJ</th>
                    <th className="py-2 pr-4 text-right font-normal kicker">Cena / MJ</th>
                    <th className="hidden py-2 pr-4 font-normal kicker lg:table-cell">Zdroj ceny</th>
                    <th className="py-2 font-normal kicker" />
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.id} className="group border-b border-stone-100">
                      <td className="hidden py-2.5 pr-4 font-mono text-stone-500 sm:table-cell">{m.code}</td>
                      <td className="py-2.5 pr-4 text-stone-950">{m.name}</td>
                      <td className="hidden py-2.5 pr-4 text-stone-500 md:table-cell">{m.category}</td>
                      <td className="hidden py-2.5 pr-4 text-right text-stone-500 sm:table-cell">{m.unit}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-stone-950">
                        {formatCurrency(Number(m.unitPrice))}
                      </td>
                      <td className="hidden py-2.5 pr-4 text-stone-400 lg:table-cell">
                        {m.priceSource}
                        {m.priceDate ? ` · ${m.priceDate.toISOString().slice(0, 10)}` : ""}
                      </td>
                      <td className="py-2.5">
                        <span className="flex items-center justify-end gap-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <MaterialForm
                            material={{
                              id: m.id,
                              code: m.code,
                              name: m.name,
                              unit: m.unit,
                              unitPrice: Number(m.unitPrice),
                              priceSource: m.priceSource,
                              priceDate: m.priceDate ? m.priceDate.toISOString().slice(0, 10) : null,
                              category: m.category,
                              note: m.note,
                            }}
                          />
                          <DeleteButton
                            action={deleteMaterial}
                            fields={{ id: m.id }}
                            confirm={`Smazat materiál „${m.name}"?`}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
