import { requireUser } from "@/lib/dal";
import { ImportForm } from "@/components/import/import-form";

export default async function ImportPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Import CSV</h1>
        <p className="mt-2 text-sm text-stone-500">
          Hromadně naimportuje výdaje včetně projektů a dodavatelů do tvého účtu.
        </p>
      </header>

      <div className="mb-8 border border-stone-300 bg-white p-5">
        <p className="kicker mb-3">Očekávané sloupce (oddělené ; nebo ,)</p>
        <div className="overflow-x-auto">
          <code className="block whitespace-nowrap text-xs text-stone-700">
            Datum · Email · Název dodavatele · Popis položky · Kategorie ·
            Částka · Měna · Projekt
          </code>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-stone-500">
          <li>
            <span className="text-stone-950">Projekt</span> a{" "}
            <span className="text-stone-950">Částka</span> jsou povinné; ostatní
            volitelné.
          </li>
          <li>Projekty a dodavatelé se založí podle názvu / e-mailu (duplicity se spojí).</li>
          <li>Datum ve formátu <span className="font-mono">DD.MM.RRRR</span>.</li>
          <li>Původní „Kategorie" se uloží do poznámky výdaje.</li>
        </ul>
      </div>

      <ImportForm />
    </div>
  );
}
