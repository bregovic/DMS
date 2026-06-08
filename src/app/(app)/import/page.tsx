import { Download, FileText } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { ImportForm } from "@/components/import/import-form";

export default async function ImportPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Import &amp; export</h1>
        <p className="mt-2 text-sm text-stone-500">
          Hromadně naimportuje výdaje včetně projektů, dodavatelů a kategorií.
        </p>
      </header>

      {/* Export / šablona */}
      <div className="mb-8 flex flex-wrap gap-3">
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

      <div className="mb-8 space-y-1.5 text-sm text-stone-500">
        <p>
          Stáhni si <span className="text-stone-950">šablonu</span> (obsahuje
          správnou hlavičku) nebo{" "}
          <span className="text-stone-950">export výdajů</span> pro úpravy.
        </p>
        <p>
          Necháš-li u řádku vyplněné <span className="font-mono">ID</span> z
          exportu, výdaj se při importu <span className="text-stone-950">aktualizuje</span>{" "}
          (jinak vznikne nový). Projekty, dodavatele i kategorie import založí
          podle názvu.
        </p>
      </div>

      <ImportForm />
    </div>
  );
}
