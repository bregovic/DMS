import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { ProjectIcon } from "@/components/projects/project-icon";
import { formatCurrency } from "@/lib/utils";
import { getProjectTypes } from "@/server/project-types";

export default async function ProjectsPage() {
  const user = await requireUser();

  const [projects, types] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: user.id },
      include: {
        _count: { select: { expenses: true, documents: true } },
        expenses: { select: { amount: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    getProjectTypes(),
  ]);

  const typeMap = new Map(types.map((t) => [t.key, t.label]));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Projekty</h1>
        <NewProjectForm types={types} />
      </header>

      {projects.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím tu nic není. Vytvoř svůj první projekt tlačítkem výše.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-px border border-stone-300/80 bg-stone-300/80 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const total = p.expenses.reduce((s, e) => s + Number(e.amount), 0);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group flex flex-col bg-white p-6 transition-colors hover:bg-stone-50"
              >
                <div className="mb-6 flex items-start justify-between">
                  <ProjectIcon type={p.type} className="size-6 text-stone-800" />
                  <ArrowUpRight className="size-4 text-stone-300 transition-colors group-hover:text-stone-950" />
                </div>
                <p className="text-base font-medium text-stone-950">{p.name}</p>
                <p className="kicker mt-1">{typeMap.get(p.type) ?? "Ostatní"}</p>
                {p.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-stone-500">
                    {p.description}
                  </p>
                )}
                <div className="mt-6 flex items-baseline justify-between border-t border-stone-200 pt-3">
                  <span className="kicker">
                    {p._count.expenses} · {p._count.documents} dok.
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
