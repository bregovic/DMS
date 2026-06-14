"use client";

import { useActionState } from "react";
import { importPlanJson } from "@/server/actions/import-plan";
import { Button } from "@/components/ui/button";

export function PlanImportForm() {
  const [state, action, pending] = useActionState(importPlanJson, undefined);
  const s = state?.summary;

  return (
    <form action={action} className="space-y-5">
      <input
        type="file"
        name="file"
        accept=".json,application/json"
        required
        className="block w-full cursor-pointer border border-stone-300 bg-white text-sm text-stone-700 file:mr-4 file:cursor-pointer file:border-0 file:border-r file:border-stone-300 file:bg-stone-100 file:px-4 file:py-2.5 file:text-stone-950 hover:file:bg-stone-200"
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Importuji plán…" : "Importovat plán (JSON)"}
      </Button>

      {state?.error && (
        <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
          {state.error}
        </p>
      )}

      {s && (
        <div className="space-y-3 border border-stone-300 bg-white p-4 text-sm text-stone-700">
          <p className="kicker">Hotovo · {s.projekt}</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
            <li>Žádanky: <span className="font-mono text-stone-950">+{s.requests.created} / ~{s.requests.updated}</span></li>
            <li>Nabídky: <span className="font-mono text-stone-950">+{s.offers.created} / ~{s.offers.updated}</span></li>
            <li>Vybráno nabídek: <span className="font-mono text-stone-950">{s.offers.selected}</span></li>
            <li>Fáze: <span className="font-mono text-stone-950">+{s.phases.created} / ~{s.phases.updated}</span></li>
            <li>Úkoly: <span className="font-mono text-stone-950">+{s.tasks.created} / ~{s.tasks.updated}</span></li>
            <li>Výdaje: <span className="font-mono text-stone-950">+{s.expenses.created} / ~{s.expenses.updated}</span></li>
            <li>Složky: <span className="font-mono text-stone-950">+{s.subProjects.created} / ~{s.subProjects.updated}</span></li>
            <li>Nové projekty: <span className="font-mono text-stone-950">{s.newProjects}</span></li>
          </ul>
          <div className="border-t border-stone-200 pt-2">
            <p className="kicker mb-1">Dodavatelé</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-stone-600">
              <li>Nově založeno: <span className="font-mono text-stone-950">{s.vendors.created}</span></li>
              <li>Doplněno z ARES: <span className="font-mono text-stone-950">{s.vendors.fromAres}</span></li>
              <li>Spárováno dle IČO: <span className="font-mono text-stone-950">{s.vendors.matchedByIco}</span></li>
              <li>Spárováno dle e-mailu: <span className="font-mono text-stone-950">{s.vendors.matchedByEmail}</span></li>
            </ul>
          </div>
          {s.warnings.length > 0 && (
            <ul className="border-t border-stone-200 pt-2 text-xs text-stone-500">
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
