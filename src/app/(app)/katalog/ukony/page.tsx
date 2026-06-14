import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { CatalogNav } from "@/components/catalog/catalog-nav";
import { OperationForm } from "@/components/catalog/operation-form";
import { deleteOperation } from "@/server/actions/process-tables";

export default async function OperationsPage() {
  const user = await requireUser();
  const operations = await prisma.operation.findMany({
    where: { ownerId: user.id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { params: true, materials: true } } },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <h1 className="display text-4xl text-stone-950">Procesní tabulky</h1>
        <OperationForm />
      </header>

      <CatalogNav />

      {operations.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím tu nejsou žádné úkony. Přidej první tlačítkem výše.
        </p>
      ) : (
        <ul className="mt-6 border-t border-stone-300/80">
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
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  <span className="font-mono text-stone-400">{o.code}</span> · MJ{" "}
                  {o.unit} · {o._count.params} parametrů · {o._count.materials}{" "}
                  materiálů v receptu
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-4 opacity-0 transition-opacity group-hover:opacity-100">
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
  );
}
