import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Wallet } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { UploadForm } from "@/components/documents/upload-form";
import { deleteProject } from "@/server/actions/projects";
import { deleteExpense } from "@/server/actions/expenses";
import { deleteDocument } from "@/server/actions/documents";
import { formatCurrency, formatDate } from "@/lib/utils";
import { categoryLabel, projectTypeLabel } from "@/lib/constants";

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

  const t = projectTypeLabel(project.type);
  const total = project.expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Zpět na projekty
      </Link>

      {/* Hlavička projektu */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="flex size-14 items-center justify-center rounded-xl text-3xl"
            style={{ backgroundColor: `${project.color}1a` }}
          >
            {t.emoji}
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {project.name}
            </h1>
            <p className="text-slate-500">
              {t.label}
              {project.description ? ` · ${project.description}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-900 px-5 py-3 text-right text-white">
            <p className="text-xs text-slate-300">Celkem</p>
            <p className="text-xl font-semibold">{formatCurrency(total)}</p>
          </div>
          <DeleteButton
            action={deleteProject}
            fields={{ id: project.id }}
            confirm={`Smazat projekt „${project.name}" včetně všech výdajů a dokumentů?`}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Výdaje */}
        <div className="space-y-4 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Wallet className="size-4 text-slate-400" />
              Výdaje ({project.expenses.length})
            </h2>
            <NewExpenseForm projectId={project.id} />
          </div>

          {project.expenses.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">
                Zatím žádné výdaje. Přidej první tlačítkem výše.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y divide-slate-100 p-0">
                {project.expenses.map((e) => (
                  <div
                    key={e.id}
                    className="group flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {e.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {categoryLabel(e.category)} · {formatDate(e.date)}
                        {e.description ? ` · ${e.description}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-semibold text-slate-900">
                        {formatCurrency(Number(e.amount), e.currency)}
                      </span>
                      <DeleteButton
                        action={deleteExpense}
                        fields={{ id: e.id, projectId: project.id }}
                        confirm="Smazat tento výdaj?"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Dokumenty */}
        <div className="space-y-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <FileText className="size-4 text-slate-400" />
            Dokumenty ({project.documents.length})
          </h2>

          <UploadForm projectId={project.id} />

          {project.documents.length > 0 && (
            <Card>
              <CardContent className="divide-y divide-slate-100 p-0">
                {project.documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                  >
                    <a
                      href={`/api/documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:text-indigo-600"
                    >
                      <FileText className="size-4 shrink-0 text-slate-400" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {d.originalName}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatBytes(d.size)}
                        </span>
                      </span>
                    </a>
                    <DeleteButton
                      action={deleteDocument}
                      fields={{ id: d.id }}
                      confirm="Smazat tento dokument?"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
