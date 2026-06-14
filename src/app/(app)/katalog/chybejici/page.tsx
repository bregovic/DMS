import { FileText } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { CatalogNav } from "@/components/catalog/catalog-nav";
import { WishForm } from "@/components/catalog/wish-form";
import { deleteCatalogWish, setCatalogWishDone } from "@/server/actions/process-tables";

export default async function WishesPage() {
  await requireUser();
  const wishes = await prisma.catalogWish.findMany({
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
  });
  const open = wishes.filter((w) => !w.done);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <h1 className="display text-4xl text-stone-950">Procesní tabulky</h1>
        {open.length > 0 && (
          <a
            href="/api/export/catalog-wishes"
            className="inline-flex h-10 items-center gap-2 border border-stone-300 px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
          >
            <FileText className="size-4" />
            Šablona chybějících + AI prompt
          </a>
        )}
      </header>

      <CatalogNav />

      <div className="mt-6 max-w-3xl space-y-8">
        <section className="space-y-3">
          <p className="text-sm text-stone-500">
            Když v katalogu nenajdeš činnost, zapiš si ji sem. Pak hromadně
            stáhneš šablonu s promptem pro AI, necháš ji doplnit a naimportuješ
            zpět do katalogu.
          </p>
          <WishForm />
        </section>

        {wishes.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">
            Zatím tu nic není. Chybějící činnosti zapisuj tlačítkem výše nebo
            přímo v dialogu „Z katalogu".
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 border-y border-stone-200">
            {wishes.map((w) => (
              <li key={w.id} className="group flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className={`text-sm ${w.done ? "text-stone-400 line-through" : "text-stone-950"}`}>
                    {w.title}
                  </p>
                  {w.note && <p className="mt-0.5 text-xs text-stone-500">{w.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <form action={setCatalogWishDone}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="done" value={w.done ? "0" : "1"} />
                    <button
                      type="submit"
                      className="text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline cursor-pointer"
                    >
                      {w.done ? "Vrátit" : "Doplněno"}
                    </button>
                  </form>
                  <DeleteButton action={deleteCatalogWish} fields={{ id: w.id }} confirm="Smazat poznámku?" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
