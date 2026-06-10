import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { listProjectsForUser } from "@/server/access";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { ProjectIcon } from "@/components/projects/project-icon";
import { formatCurrency } from "@/lib/utils";
import { getProjectTypes } from "@/server/project-types";
import { roleLabel } from "@/lib/constants";

export default async function ProjectsPage() {
  const user = await requireUser();

  const [items, types] = await Promise.all([
    listProjectsForUser(user),
    getProjectTypes(),
  ]);
  const typeMap = new Map(types.map((t) => [t.key, t.label]));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Projekty</h1>
        <NewProjectForm types={types} />
      </header>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím tu nic není. Vytvoř svůj první projekt tlačítkem výše.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ project: p, role }) => {
            // Aktivní dodavatel vidí jen součet svých vlastních nákladů
            const visible =
              role === "active"
                ? p.expenses.filter((e) => e.createdById === user.id)
                : p.expenses;
            const total = visible.reduce((s, e) => s + Number(e.amount), 0);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group flex flex-col border border-stone-200 bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="mb-6 flex items-start justify-between">
                  <ProjectIcon type={p.type} className="size-6 text-stone-800" />
                  <ArrowUpRight className="size-4 text-stone-300 transition-colors group-hover:text-stone-950" />
                </div>
                <p className="text-base font-medium text-stone-950">{p.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="kicker">{typeMap.get(p.type) ?? "Ostatní"}</span>
                  {role !== "owner" && (
                    <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                      {roleLabel(role)}
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-stone-500">
                    {p.description}
                  </p>
                )}
                <div className="mt-6 flex items-baseline justify-between border-t border-stone-200 pt-3">
                  <span className="kicker">
                    {role === "active" ? visible.length : p._count.expenses}
                    {role === "active" ? "" : ` · ${p._count.documents} dok.`}
                  </span>
                  <span className="font-mono text-sm text-stone-950">
                    {formatCurrency(total)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
