"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Výběr projektu pro reporty. Prázdná hodnota = všechny projekty. */
export function ProjectSelect({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const value = sp.get("project") ?? "";

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        router.replace(v ? `/reports?project=${v}` : "/reports", {
          scroll: false,
        });
      }}
      aria-label="Projekt"
      className="h-9 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
    >
      <option value="">Všechny projekty</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
