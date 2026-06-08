import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getProjectRole } from "@/server/access";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { ProjectIcon } from "@/components/projects/project-icon";
import { ProjectVendors } from "@/components/projects/project-vendors";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { UploadForm } from "@/components/documents/upload-form";
import { deleteProject } from "@/server/actions/projects";
import { deleteExpense } from "@/server/actions/expenses";
import { deleteDocument } from "@/server/actions/documents";
import { formatCurrency, formatDate } from "@/lib/utils";
import { roleLabel } from "@/lib/constants";
import { getProjectTypeMap } from "@/server/project-types";
import { getExpenseCategories } from "@/server/expense-categories";

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

  const role = await getProjectRole(id, user);
  if (!role) notFound();
  const isOwner = role === "owner";

  const [project, typeMap, categories] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        expenses: {
          orderBy: { date: "desc" },
          include: { vendor: { select: { id: true, name: true } } },
        },
        documents: { orderBy: { createdAt: "desc" } },
        vendors: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        },
        memberships: true,
      },
    }),
    getProjectTypeMap(),
    getExpenseCategories(),
  ]);
  if (!project) notFound();

  const catMap = new Map(categories.map((c) => [c.key, c.label]));
  const typeLabel = typeMap.get(project.type) ?? "Ostatní";
  const total = project.expenses.reduce((s, e) => s + Number(e.amount), 0);

  const memByEmail = new Map(
    project.memberships.map((m) => [m.email.toLowerCase(), m.role]),
  );
  const rolesByVendor: Record<string, string> = {};
  for (const v of project.vendors) {
    rolesByVendor[v.id] = memByEmail.get(v.email.toLowerCase()) ?? "vendor";
  }

  const accountVendors = isOwner
    ? await prisma.vendor.findMany({
        where: { ownerId: project.ownerId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      })
    : [];
  const assignedIds = new Set(project.vendors.map((v) => v.id));
  const availableVendors = accountVendors.filter((v) => !assignedIds.has(v.id));

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
            <div className="flex items-center gap-2">
              <p className="kicker">{typeLabel}</p>
              {!isOwner && (
                <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                  {roleLabel(role)}
                </span>
              )}
            </div>
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
          {isOwner && (
            <DeleteButton
              action={deleteProject}
              fields={{ id: project.id }}
              confirm={`Smazat projekt „${project.name}" včetně všech výdajů a dokumentů?`}
              className="flex w-10 items-center justify-center border border-stone-300 text-stone-400 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white cursor-pointer"
            />
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-12 lg:grid-cols-5">
        {/* Výdaje */}
        <section className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between border-b border-stone-300/80 pb-2">
            <h2 className="kicker">Výdaje · {project.expenses.length}</h2>
            {isOwner && (
              <NewExpenseForm
                projectId={project.id}
                vendors={accountVendors.map((v) => ({ id: v.id, name: v.name }))}
                categories={categories}
              />
            )}
          </div>

          {project.expenses.length === 0 ? (
            <p className="py-8 text-sm text-stone-500">Zatím žádné výdaje.</p>
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
                      {catMap.get(e.category) ?? e.category} · {formatDate(e.date)}
                      {e.vendor ? ` · ${e.vendor.name}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm text-stone-950">
                      {formatCurrency(Number(e.amount), e.currency)}
                    </span>
                    {isOwner && (
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">
                        <DeleteButton
                          action={deleteExpense}
                          fields={{ id: e.id, projectId: project.id }}
                          confirm="Smazat tento výdaj?"
                        />
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pravý sloupec */}
        <div className="space-y-10 lg:col-span-2">
          <section>
            <div className="mb-4 border-b border-stone-300/80 pb-2">
              <h2 className="kicker">Dodavatelé · {project.vendors.length}</h2>
            </div>
            <ProjectVendors
              projectId={project.id}
              assigned={project.vendors}
              available={availableVendors}
              rolesByVendor={rolesByVendor}
              canManage={isOwner}
            />
          </section>

          <section>
            <div className="mb-4 border-b border-stone-300/80 pb-2">
              <h2 className="kicker">Dokumenty · {project.documents.length}</h2>
            </div>
            {isOwner && <UploadForm projectId={project.id} />}
            {project.documents.length > 0 && (
              <ul className={isOwner ? "mt-4" : ""}>
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
                      <span className="kicker mt-0.5 block">
                        {formatBytes(d.size)}
                      </span>
                    </a>
                    {isOwner && (
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">
                        <DeleteButton
                          action={deleteDocument}
                          fields={{ id: d.id }}
                          confirm="Smazat tento dokument?"
                        />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
