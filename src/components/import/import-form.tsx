"use client";

import { useActionState } from "react";
import { importExpensesCsv } from "@/server/actions/import";
import { Button } from "@/components/ui/button";

export function ImportForm() {
  const [state, action, pending] = useActionState(importExpensesCsv, undefined);

  return (
    <form action={action} className="space-y-5">
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="block w-full cursor-pointer border border-stone-300 bg-white text-sm text-stone-700 file:mr-4 file:cursor-pointer file:border-0 file:border-r file:border-stone-300 file:bg-stone-100 file:px-4 file:py-2.5 file:text-stone-950 hover:file:bg-stone-200"
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Importuji…" : "Importovat CSV"}
      </Button>

      {state?.error && (
        <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
          {state.error}
        </p>
      )}

      {state?.summary && (
        <div className="border border-stone-300 bg-white p-4">
          <p className="kicker mb-2">Hotovo</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-stone-700">
            <li>
              Vytvořeno výdajů:{" "}
              <span className="font-mono text-stone-950">
                {state.summary.created}
              </span>
            </li>
            <li>
              Aktualizováno:{" "}
              <span className="font-mono text-stone-950">
                {state.summary.updated}
              </span>
            </li>
            <li>
              Nových projektů:{" "}
              <span className="font-mono text-stone-950">
                {state.summary.newProjects}
              </span>
            </li>
            <li>
              Nových dodavatelů:{" "}
              <span className="font-mono text-stone-950">
                {state.summary.newVendors}
              </span>
            </li>
            <li>
              Nových kategorií:{" "}
              <span className="font-mono text-stone-950">
                {state.summary.newCategories}
              </span>
            </li>
            <li>
              Přeskočeno řádků:{" "}
              <span className="font-mono text-stone-950">
                {state.summary.skipped}
              </span>
            </li>
          </ul>
        </div>
      )}
    </form>
  );
}
