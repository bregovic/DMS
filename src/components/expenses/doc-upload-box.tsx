"use client";

import { useState } from "react";
import { UploadDialog } from "@/components/documents/upload-dialog";

/**
 * Nahrání dokladu mimo projekt (modul Doklady): nejdřív se vybere projekt,
 * pak se soubor nahraje a rovnou přečte.
 */
export function DocUploadBox({ projects }: { projects: { id: string; name: string }[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  if (!projects.length) return null;
  return (
    <div className="space-y-2 border border-stone-200 bg-white p-3 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="kicker">Nahrát doklad do projektu</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Projekt"
          className="h-8 rounded-none border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:border-stone-950 focus-visible:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <UploadDialog
        key={projectId}
        projectId={projectId}
        types={[
          { value: "receipt", label: "Účtenka" },
          { value: "invoice", label: "Faktura" },
        ]}
        defaultType="receipt"
        label="Nahrát doklad"
        title="Nahrát účtenku nebo fakturu"
        hint="Přetáhni sem soubory nebo je vyber. Fotku dokladu systém ořízne, narovná a přečte."
        variant="primary"
      />
    </div>
  );
}
