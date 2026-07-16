import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { CatalogNav } from "@/components/catalog/catalog-nav";
import { OperationForm } from "@/components/catalog/operation-form";
import { ListFilters } from "@/components/ui/list-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteOperation } from "@/server/actions/process-tables";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = (typeof sp?.uq === "string" ? sp.uq : "").trim().toLowerCase();
  const cat = typeof sp?.ucat === "string" ? sp.ucat : "";
  const sort = sp?.usort === "code" ? "code" : "name";
  const dir = sp?.udir === "desc" ? "desc" : "asc";

  const all = await prisma.operation.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { params: true, materials: true } } },
  });
  const categories = [...new Set(all.map((o) => o.category).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "cs"),
  );

  let operations = all;
  if (q)
    operations = operations.filter(
      (o) =>
        o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q),
    );
  if (cat) operations = operations.filter((o) => o.category === cat);
  const sign = dir === "asc" ? 1 : -1;
  operations = [...operations].sort(
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
        <OperationForm />
      </header>

      <CatalogNav />

      {all.length === 0 ? (
        <EmptyState
          title="Zatím žádné úkony"
          description="Přidej první tlačítkem výše."
        />
      ) : (
        <div className="mt-6">
          <ListFilters
            prefix="u"
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
          <p className="mb-1 text-xs text-stone-500">
            {operations.length}
            {filterActive ? ` z ${all.length}` : ""} úkonů
          </p>
          {operations.length === 0 ? (
            <EmptyState title="Nic neodpovídá filtru" />
          ) : (
            <ul className="border-t border-stone-300/80">
              {operations.map((o) => (
                <li
                  key={o.id}
                  className="group flex items-center justify-between gap-4 border-b border-stone-200 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3">
                      <Link
                        href={`/katalog/ukony/${o.id}`}
                        className="font-medium text-stone-950 underline-offset-4 hover:underline"
                      >
                        {o.name}
                      </Link>
                      <span className="kicker">{o.category}</span>
                      {o._count.materials === 0 && (
                        <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                          ⚠ bez receptu · jen práce
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      <span className="font-mono text-stone-400">{o.code}</span> · MJ{" "}
                      {o.unit} · {o._count.params} parametrů ·{" "}
                      {o._count.materials === 0 ? (
                        <span className="text-amber-700">žádný materiál v receptu (počítá jen práci)</span>
                      ) : (
                        `${o._count.materials} materiálů v receptu`
                      )}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-4 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Link
                      href={`/katalog/ukony/${o.id}`}
                      className="text-sm text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                    >
                      Detail →
                    </Link>
                    <DeleteButton
                      action={deleteOperation}
                      fields={{ id: o.id }}
                      confirm={`Smazat úkon „${o.name}" včetně parametrů a receptu?`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
