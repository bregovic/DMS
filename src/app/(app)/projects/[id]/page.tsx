import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { ProjectIcon } from "@/components/projects/project-icon";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { UploadForm } from "@/components/documents/upload-form";
import { deleteProject } from "@/server/actions/projects";
import { deleteExpense } from "@/server/actions/expenses";
import { deleteDocument } from "@/server/actions/documents";
import { formatCurrency, formatDate } from "@/lib/utils";
import { categoryLabel } from "@/lib/constants";
import { getProjectTypeMap } from "@/server/project-types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ProjectDetailPage({
  params,
}: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, ownerId: user.id },
    include: {
      expenses: { orderBy: { date: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) notFound();

  const typeMap = await getProjectTypeMap();
  const typeLabel = typeMap.get(project.type) ?? "Ostatní";
  const total = project.expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        Projekty
      </Link>

      {/* Hlavička */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-6 border-b border-stone-300/80 pb-8">
        <div className="flex items-start gap-4">
          <ProjectIcon type={project.type} className="mt-1 size-7 text-stone-800" />
          <div>
            <p className="kicker">{typeLabel}</p>
            <h1 className="display mt-1 text-4xl text-stone-950">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-2 max-w-md text-sm text-stone-500">
                {project.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-stretch gap-3">
          <div className="bg-stone-950 px-6 py-4 text-right text-white">
            <p className="kicker !text-stone-400">Celkem</p>
            <p className="display mt-1 text-2xl">{formatCurrency(total)}</p>
          </div>
          <DeleteButton
            action={deleteProject}
            fields={{ id: project.id }}
            confirm={`Smazat projekt „${project.name}" včetně všech výdajů a dokumentů?`}
            className="flex w-10 items-center justify-center border border-stone-300 text-stone-400 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white cursor-pointer"
          />
        </div>
      </div>

      <div className="mt-8 grid gap-12 lg:grid-cols-5">
        {/* Výdaje */}
        <section className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between border-b border-stone-300/80 pb-2">
            <h2 className="kicker">Výdaje · {project.expenses.length}</h2>
            <NewExpenseForm projectId={project.id} />
          </div>

          {project.expenses.length === 0 ? (
            <p className="py-8 text-sm text-stone-500">
              Zatím žádné výdaje. Přidej první tlačítkem výše.
            </p>
          ) : (
            <ul>
              {project.expenses.map((e) => (
                <li
                  key={e.id}
                  className="group flex items-baseline justify-between gap-3 border-b border-stone-200 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-950">
                      {e.title}
                    </p>
                    <p className="kicker mt-0.5">
                      {categoryLabel(e.category)} · {formatDate(e.date)}
                      {e.description ? ` · ${e.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm text-stone-950">
                      {formatCurrency(Number(e.amount), e.currency)}
                    </span>
                    <span className="opacity-0 transition-opacity group-hover:opacity-100">
                      <DeleteButton
                        action={deleteExpense}
                        fields={{ id: e.id, projectId: project.id }}
                        confirm="Smazat tento výdaj?"
                      />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Dokumenty */}
        <section className="lg:col-span-2">
          <div className="mb-4 border-b border-stone-300/80 pb-2">
            <h2 className="kicker">Dokumenty · {project.documents.length}</h2>
          </div>

          <UploadForm projectId={project.id} />

          {project.documents.length > 0 && (
            <ul className="mt-4">
              {project.documents.map((d) => (
                <li
                  key={d.id}
                  className="group flex items-center justify-between gap-2 border-b border-stone-200 py-3"
                >
                  <a
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1"
                  >
                    <span className="block truncate text-sm font-medium text-stone-950 underline-offset-4 group-hover:underline">
                      {d.originalName}
                    </span>
                    <span className="kicker mt-0.5 block">{formatBytes(d.size)}</span>
                  </a>
                  <span className="opacity-0 transition-opacity group-hover:opacity-100">
                    <DeleteButton
                      action={deleteDocument}
                      fields={{ id: d.id }}
                      confirm="Smazat tento dokument?"
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
