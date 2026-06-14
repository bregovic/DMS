"use client";

import { useActionState } from "react";
import { importCatalog } from "@/server/actions/process-tables";
import { Button } from "@/components/ui/button";

const inputClass =
  "block w-full cursor-pointer border border-stone-300 bg-white text-sm text-stone-700 file:mr-4 file:cursor-pointer file:border-0 file:border-r file:border-stone-300 file:bg-stone-100 file:px-4 file:py-2.5 file:text-stone-950 hover:file:bg-stone-200";

export function CatalogImportForm() {
  const [state, action, pending] = useActionState(importCatalog, undefined);
  const s = state?.summary;

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label className="kicker">Materiály (materials.csv)</label>
        <input type="file" name="materials" accept=".csv,text/csv" className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label className="kicker">Úkony (tasks.csv)</label>
        <input type="file" name="tasks" accept=".csv,text/csv" className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label className="kicker">Recepty (task_materials.csv)</label>
        <input type="file" name="taskMaterials" accept=".csv,text/csv" className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label className="kicker">Balíčky (packages.csv)</label>
        <input type="file" name="packages" accept=".csv,text/csv" className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label className="kicker">Obsah balíčků (package_items.csv)</label>
        <input type="file" name="packageItems" accept=".csv,text/csv" className={inputClass} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Importuji katalog…" : "Importovat katalog (CSV)"}
      </Button>

      {state?.error && (
        <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
          {state.error}
        </p>
      )}

      {s && (
        <div className="space-y-3 border border-stone-300 bg-white p-4 text-sm text-stone-700">
          <p className="kicker">Hotovo</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            <li>Materiály: <span className="font-mono text-stone-950">{s.materials}</span></li>
            <li>Úkony: <span className="font-mono text-stone-950">{s.operations}</span></li>
            <li>Recepty: <span className="font-mono text-stone-950">{s.recipes}</span></li>
            <li>Balíčky: <span className="font-mono text-stone-950">{s.packages}</span></li>
            <li>Položky balíčků: <span className="font-mono text-stone-950">{s.packageItems}</span></li>
          </ul>
          {s.warnings.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto border-t border-stone-200 pt-2 text-xs text-stone-500">
              {s.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
