import { Download, FileText, FileJson } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { fullAccessProjectIds } from "@/server/access";
import { ImportForm } from "@/components/import/import-form";
import { PlanImportForm } from "@/components/import/plan-import-form";
import { CatalogImportForm } from "@/components/import/catalog-import-form";

export default async function ImportPage() {
  const user = await requireUser();
  const ids = [...(await fullAccessProjectIds(user))];
  const projects = await prisma.project.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ownerId: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Import &amp; export</h1>
        <p className="mt-2 text-sm text-stone-500">
          Výdaje v CSV, nebo celý projektový plán (žádanky, nabídky, fáze, úkoly
          a výdaje) v JSON.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Projektový plán (JSON) */}
      {/* ------------------------------------------------------------------ */}
      <section className="mb-12">
        <h2 className="display text-2xl text-stone-950">Projektový plán</h2>
        <p className="mt-2 mb-5 text-sm text-stone-500">
          Vyexportuj plán projektu, doplň ho (klidně i v Claude) a naimportuj
          zpět. Existující záznamy se podle <span className="font-mono">ID</span>{" "}
          aktualizují, nové vzniknou. Dodavatelé se párují podle{" "}
          <span className="text-stone-950">IČO</span> (případně e-mailu); chybějící
          se založí a doplní z <span className="text-stone-950">ARES</span>.
          Vybraná nabídka se propíše do žádanky, výdaje se naváží na žádanku i
          nabídku (realizace).
        </p>

        {projects.length === 0 ? (
          <p className="mb-6 text-sm text-stone-400">Zatím nemáš žádný projekt k exportu.</p>
        ) : (
          <div className="mb-6">
            <p className="kicker mb-2">Export plánu projektu</p>
            <ul className="divide-y divide-stone-200 border border-stone-200">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="flex items-center gap-2 truncate text-sm text-stone-800">
                    {p.name}
                    {p.ownerId !== user.id && (
                      <span className="kicker !text-stone-400">člen</span>
                    )}
                  </span>
                  <a
                    href={`/api/export/plan?projectId=${p.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline"
                  >
                    <FileJson className="size-4" />
                    Stáhnout plán
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="kicker mb-2">Import plánu</p>
        <PlanImportForm />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Výdaje (CSV) */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-stone-300/80 pt-8">
        <h2 className="display text-2xl text-stone-950">Výdaje (CSV)</h2>
        <p className="mt-2 mb-5 text-sm text-stone-500">
          Hromadný import/export výdajů včetně projektů, subprojektů, dodavatelů
          a kategorií.
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <a
            href="/api/export/template"
            className="inline-flex h-10 items-center gap-2 border border-stone-300 px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
          >
            <FileText className="size-4" />
            Stáhnout šablonu
          </a>
          <a
            href="/api/export/expenses"
            className="inline-flex h-10 items-center gap-2 border border-stone-300 px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
          >
            <Download className="size-4" />
            Exportovat výdaje
          </a>
        </div>

        <p className="mb-5 text-sm text-stone-500">
          Necháš-li u řádku vyplněné <span className="font-mono">ID</span> z
          exportu, výdaj se <span className="text-stone-950">aktualizuje</span>{" "}
          (jinak vznikne nový). Projekty, subprojekty, dodavatele i kategorie
          import založí podle názvu.
        </p>

        <ImportForm />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Katalog procesů (CSV) */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-stone-300/80 pt-8">
        <h2 className="display text-2xl text-stone-950">Katalog procesů (CSV)</h2>
        <p className="mt-2 mb-5 text-sm text-stone-500">
          Materiály, úkony a recepty (spotřeba materiálu) pro Procesní tabulky.
          Oddělovač <span className="font-mono">;</span>, UTF-8, desetinná tečka;
          řádky začínající <span className="font-mono">#</span> jsou kategorie.
          Importuj v pořadí materiály → úkony → recepty (provazují se přes{" "}
          <span className="font-mono">code</span>). Existující se podle kódu{" "}
          <span className="text-stone-950">aktualizují</span>.
        </p>

        <div className="mb-6">
          <a
            href="/api/export/catalog"
            className="inline-flex h-10 items-center gap-2 border border-stone-300 px-4 text-sm font-medium text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
          >
            <FileText className="size-4" />
            Stáhnout šablonu + AI prompt
          </a>
          <p className="mt-2 text-sm text-stone-500">
            Šablona obsahuje stávající katalog ve formátu CSV a prompt pro AI –
            předáš ho AI, ta doplní další položky a ty je naimportuješ zpět.
          </p>
        </div>

        <CatalogImportForm />
      </section>
    </div>
  );
}
