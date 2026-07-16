import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { CatalogNav } from "@/components/catalog/catalog-nav";
import { MaterialForm } from "@/components/catalog/material-form";
import { deleteMaterial } from "@/server/actions/process-tables";
import { formatCurrency } from "@/lib/utils";

export default async function MaterialsPage() {
  await requireUser();
  const materials = await prisma.material.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { recipes: true } } },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <h1 className="display text-4xl text-stone-950">Procesní tabulky</h1>
        <MaterialForm />
      </header>

      <CatalogNav />

      {materials.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím tu nejsou žádné materiály. Přidej první tlačítkem výše, nebo je
          později naimportuj z CSV.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-6 w-full text-sm">
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
  );
}
