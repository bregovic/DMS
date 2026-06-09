import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Folder, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getProjectRole } from "@/server/access";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { ProjectIcon } from "@/components/projects/project-icon";
import { ProjectVendors } from "@/components/projects/project-vendors";
import { Collapsible } from "@/components/app/collapsible";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { EditExpenseForm } from "@/components/expenses/edit-expense-form";
import { ExpenseStageSelect } from "@/components/expenses/expense-stage-select";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseScan } from "@/components/expenses/expense-scan";
import { PaymentInfo } from "@/components/expenses/payment-info";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { RequestStatusSelect } from "@/components/requests/request-status-select";
import { OffersPanel } from "@/components/requests/offers-panel";
import { NewSubProjectForm } from "@/components/subprojects/new-subproject-form";
import { UploadForm } from "@/components/documents/upload-form";
import { deleteProject } from "@/server/actions/projects";
import { deleteSubProject } from "@/server/actions/subprojects";
import { approveExpense, deleteExpense } from "@/server/actions/expenses";
import { deleteDocument } from "@/server/actions/documents";
import { createExpenseFromRequest, deleteRequest } from "@/server/actions/requests";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  kindLabel,
  requestStatusLabel,
  roleLabel,
  statusLabel,
  unitLabel,
} from "@/lib/constants";
import { getProjectTypeMap } from "@/server/project-types";
import { getExpenseCategories } from "@/server/expense-categories";
import { getDocumentTypes } from "@/server/document-types";
import { getStatuses } from "@/server/statuses";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const docFilter = typeof sp?.docType === "string" ? sp.docType : null;

  const role = await getProjectRole(id, user);
  if (!role) notFound();
  const isOwner = role === "owner";
  const canAdd = role === "owner" || role === "active";
  // Aktivní dodavatel vidí jen své vlastní záznamy
  const onlyMine = role === "active";

  const [project, typeMap, categories, docTypes] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        expenses: {
          orderBy: [{ status: "desc" }, { date: "desc" }],
          include: {
            vendor: { select: { id: true, name: true, bankAccount: true } },
            createdBy: { select: { name: true, email: true } },
            documents: {
              select: { id: true, originalName: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        documents: {
          where: onlyMine ? { uploadedById: user.id } : undefined,
          orderBy: { createdAt: "desc" },
        },
        vendors: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        },
        memberships: true,
        subProjects: { orderBy: { createdAt: "asc" } },
        requests: {
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          include: {
            vendor: { select: { name: true } },
            createdBy: { select: { name: true, email: true } },
            offers: {
              orderBy: [{ selected: "desc" }, { price: "asc" }, { createdAt: "asc" }],
              include: { vendor: { select: { name: true } } },
            },
          },
        },
      },
    }),
    getProjectTypeMap(),
    getExpenseCategories(),
    getDocumentTypes(),
  ]);
  if (!project) notFound();

  const catMap = new Map(categories.map((c) => [c.key, c.label]));
  const typeLabel = typeMap.get(project.type) ?? "Ostatní";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // --- Subprojekty (drill-down) ---
  const sub = typeof sp?.sub === "string" ? sp.sub : null;
  const subs = project.subProjects;
  const subById = new Map(subs.map((s) => [s.id, s]));
  const ancestorsOf = (sid: string) => {
    const out: string[] = [];
    let cur = subById.get(sid);
    while (cur?.parentId) {
      out.push(cur.parentId);
      cur = subById.get(cur.parentId);
    }
    return out;
  };

  // Viditelné položky (aktivní dodavatel jen svoje)
  const visExpenses = onlyMine
    ? project.expenses.filter((e) => e.createdById === user.id)
    : project.expenses;
  const visRequests = onlyMine
    ? project.requests.filter((r) => r.createdById === user.id)
    : project.requests;

  const total = visExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Útrata po subprojektech (rollup i do nadřazených)
  const spentBySub = new Map<string, number>();
  for (const e of visExpenses) {
    if (!e.subProjectId) continue;
    const amt = Number(e.amount);
    for (const sid of [e.subProjectId, ...ancestorsOf(e.subProjectId)]) {
      spentBySub.set(sid, (spentBySub.get(sid) ?? 0) + amt);
    }
  }

  // Aktivní dodavatel: viditelné jen složky, které založil nebo se ho týkají
  let visibleSubIds: Set<string> | null = null;
  if (onlyMine) {
    const set = new Set<string>();
    for (const s of subs) if (s.createdById === user.id) set.add(s.id);
    for (const e of visExpenses)
      if (e.subProjectId) {
        set.add(e.subProjectId);
        ancestorsOf(e.subProjectId).forEach((a) => set.add(a));
      }
    for (const r of visRequests)
      if (r.subProjectId) {
        set.add(r.subProjectId);
        ancestorsOf(r.subProjectId).forEach((a) => set.add(a));
      }
    visibleSubIds = set;
  }

  const currentSub = sub ? subById.get(sub) ?? null : null;
  if (sub && !currentSub) notFound();

  const crumb: typeof subs = [];
  {
    let cur = currentSub;
    while (cur) {
      crumb.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) ?? null : null;
    }
  }

  let folders = subs.filter((s) => (s.parentId ?? null) === (sub ?? null));
  const visIds = visibleSubIds;
  if (visIds) folders = folders.filter((s) => visIds.has(s.id));
  const childCount = (sid: string) =>
    subs.filter((s) => s.parentId === sid).length;

  const levelExpenses = visExpenses.filter(
    (e) => (e.subProjectId ?? null) === (sub ?? null),
  );
  const levelRequests = visRequests.filter(
    (r) => (r.subProjectId ?? null) === (sub ?? null),
  );
  // Náklady přímo na této úrovni (mimo podsložky)
  const levelTotal = levelExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Filtrace (název, datum) + řazení (datum / částka) výdajů na této úrovni
  const eq = (typeof sp?.eq === "string" ? sp.eq : "").trim().toLowerCase();
  const efrom = typeof sp?.efrom === "string" && sp.efrom ? new Date(sp.efrom) : null;
  const etoRaw = typeof sp?.eto === "string" && sp.eto ? new Date(sp.eto) : null;
  if (etoRaw) etoRaw.setHours(23, 59, 59, 999);
  const esort = sp?.esort === "amount" ? "amount" : "date";
  const edir = sp?.edir === "asc" ? "asc" : "desc";

  let shownExpenses = levelExpenses;
  if (eq) shownExpenses = shownExpenses.filter((e) => e.title.toLowerCase().includes(eq));
  if (efrom && !isNaN(efrom.getTime()))
    shownExpenses = shownExpenses.filter((e) => e.date >= efrom);
  if (etoRaw && !isNaN(etoRaw.getTime()))
    shownExpenses = shownExpenses.filter((e) => e.date <= etoRaw);
  const sign = edir === "asc" ? 1 : -1;
  shownExpenses = [...shownExpenses].sort((a, b) =>
    esort === "amount"
      ? (Number(a.amount) - Number(b.amount)) * sign
      : (a.date.getTime() - b.date.getTime()) * sign,
  );
  const expenseFilterActive = Boolean(eq || efrom || etoRaw);

  const docTypeMap = new Map(docTypes.map((t) => [t.value, t.label]));
  const docTypesPresent = docTypes.filter((t) =>
    project.documents.some((d) => d.type === t.value),
  );
  const shownDocs = docFilter
    ? project.documents.filter((d) => d.type === docFilter)
    : project.documents;
  const chipClass = (active: boolean) =>
    `border px-2 py-0.5 text-[11px] uppercase tracking-wide transition-colors ${
      active
        ? "border-stone-950 bg-stone-950 text-white"
        : "border-stone-300 text-stone-500 hover:border-stone-950"
    }`;

  const memByEmail = new Map(
    project.memberships.map((m) => [m.email.toLowerCase(), m.role]),
  );
  const rolesByVendor: Record<string, string> = {};
  for (const v of project.vendors) {
    rolesByVendor[v.id] = memByEmail.get(v.email.toLowerCase()) ?? "vendor";
  }

  const accountVendors = canAdd
    ? await prisma.vendor.findMany({
        where: { ownerId: project.ownerId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, hourlyRate: true },
      })
    : [];
  const assignedIds = new Set(project.vendors.map((v) => v.id));
  const availableVendors = accountVendors.filter((v) => !assignedIds.has(v.id));

  const [reqStatuses, offerStatuses, expenseStatuses] = await Promise.all([
    getStatuses("request"),
    getStatuses("offer"),
    getStatuses("expense"),
  ]);
  const reqStatusMap = new Map(reqStatuses.map((s) => [s.key, s.label]));
  const expStageMap = new Map(expenseStatuses.map((s) => [s.key, s.label]));
  const offerVendorItems = accountVendors.map((v) => ({ id: v.id, label: v.name }));

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
            {folders.length > 0 && (
              <p className="mt-1 text-xs text-stone-400">
                přímo zde {formatCurrency(levelTotal)}
              </p>
            )}
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

      {/* Breadcrumb subprojektů */}
      <nav className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
        <Link
          href={`/projects/${project.id}`}
          className={
            sub
              ? "text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
              : "font-medium text-stone-950"
          }
        >
          {project.name}
        </Link>
        {crumb.map((cs, i) => (
          <span key={cs.id} className="flex items-center gap-1.5">
            <span className="text-stone-300">/</span>
            <Link
              href={`/projects/${project.id}?sub=${cs.id}`}
              className={
                i === crumb.length - 1
                  ? "font-medium text-stone-950"
                  : "text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
              }
            >
              {cs.name}
            </Link>
          </span>
        ))}
      </nav>

      {/* Subprojekty (složky) */}
      <section className="mt-6">
        <div className="mb-4 flex items-center justify-between border-b border-stone-300/80 pb-2">
          <h2 className="kicker">Subprojekty · {folders.length}</h2>
          {canAdd && (
            <NewSubProjectForm projectId={project.id} parentId={sub ?? undefined} />
          )}
        </div>

        {currentSub && (
          <div className="mb-4 flex flex-wrap gap-x-8 gap-y-1 text-sm text-stone-600">
            {currentSub.description && <span>{currentSub.description}</span>}
            {currentSub.deadline && (
              <span>
                Termín:{" "}
                <span className="text-stone-950">
                  {formatDate(currentSub.deadline)}
                </span>
              </span>
            )}
            <span>
              Útrata:{" "}
              <span className="font-mono text-stone-950">
                {formatCurrency(spentBySub.get(currentSub.id) ?? 0)}
              </span>
              {currentSub.budget != null && (
                <> / rozpočet {formatCurrency(Number(currentSub.budget))}</>
              )}
            </span>
          </div>
        )}

        {folders.length === 0 ? (
          <p className="py-3 text-sm text-stone-500">
            Žádné subprojekty na této úrovni.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-px border border-stone-300/80 bg-stone-300/80 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((s) => {
              const spent = spentBySub.get(s.id) ?? 0;
              const budget = s.budget != null ? Number(s.budget) : null;
              const over = budget != null && spent > budget;
              return (
                <div
                  key={s.id}
                  className="group relative bg-white p-5 transition-colors hover:bg-stone-50"
                >
                  <Link
                    href={`/projects/${project.id}?sub=${s.id}`}
                    className="block"
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="size-5 shrink-0 text-stone-700" />
                      <span className="min-w-0 flex-1 truncate font-medium text-stone-950">
                        {s.name}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-stone-100 pt-2">
                      <span className="kicker">
                        {childCount(s.id)} pod ·{" "}
                        {s.deadline ? formatDate(s.deadline) : "—"}
                      </span>
                      <span
                        className={`font-mono text-sm ${over ? "text-red-600" : "text-stone-950"}`}
                      >
                        {formatCurrency(spent)}
                        {budget != null ? ` / ${formatCurrency(budget)}` : ""}
                      </span>
                    </div>
                  </Link>
                  {(isOwner || s.createdById === user.id) && (
                    <span className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <DeleteButton
                        action={deleteSubProject}
                        fields={{ id: s.id, projectId: project.id }}
                        confirm={`Smazat subprojekt „${s.name}"? (vnořené se smažou, položky se odpojí)`}
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-8 flex flex-col gap-10">
        {/* Výdaje */}
        <section className="order-2">
          <div className="mb-4 flex items-center justify-between border-b border-stone-300/80 pb-2">
            <h2 className="kicker">
              Výdaje · {shownExpenses.length}
              {expenseFilterActive ? ` z ${levelExpenses.length}` : ""}
              {onlyMine ? " · jen tvoje" : ""}
            </h2>
            {canAdd && (
              <NewExpenseForm
                projectId={project.id}
                subProjectId={sub ?? undefined}
                vendors={accountVendors.map((v) => ({
                  id: v.id,
                  name: v.name,
                  hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
                }))}
                categories={categories}
                docTypes={docTypes}
                statuses={expenseStatuses}
              />
            )}
          </div>

          {levelExpenses.length === 0 ? (
            <p className="py-8 text-sm text-stone-500">Zatím žádné výdaje.</p>
          ) : (
            <>
            <ExpenseFilters />
            {shownExpenses.length === 0 ? (
              <p className="py-8 text-sm text-stone-500">
                Nic neodpovídá filtru.
              </p>
            ) : (
            <ul>
              {shownExpenses.map((e) => (
                <li
                  key={e.id}
                  className="group flex items-baseline justify-between gap-3 border-b border-stone-200 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-stone-950">
                      {e.title}
                      {e.documents.length > 0 && (
                        <Paperclip className="size-3 shrink-0 text-stone-400" />
                      )}
                      {e.status === "for_approval" && (
                        <span className="shrink-0 border border-amber-500 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
                          {statusLabel(e.status)}
                        </span>
                      )}
                    </p>
                    <p className="kicker mt-0.5">
                      {kindLabel(e.kind)} · {catMap.get(e.category) ?? e.category} ·{" "}
                      {formatDate(e.date)}
                      {e.vendor ? ` · ${e.vendor.name}` : ""}
                      {e.hours ? ` · ${Number(e.hours)} h × ${Number(e.rate)}` : ""}
                      {` · zadal ${e.createdBy.name ?? e.createdBy.email ?? "?"}`}
                    </p>
                    <PaymentInfo
                      expenseId={e.id}
                      projectId={project.id}
                      paid={e.paid}
                      dueLabel={e.dueDate ? formatDate(e.dueDate) : null}
                      overdue={
                        !e.paid && !!e.dueDate && new Date(e.dueDate) < todayStart
                      }
                      hasBank={Boolean(e.vendor?.bankAccount)}
                      canManage={isOwner}
                    />
                    <ExpenseScan
                      projectId={project.id}
                      expenseId={e.id}
                      docs={e.documents}
                      canAttach={canAdd}
                      types={docTypes}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOwner ? (
                      <ExpenseStageSelect
                        projectId={project.id}
                        id={e.id}
                        stage={e.stage}
                        statuses={expenseStatuses}
                      />
                    ) : (
                      e.stage && (
                        <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                          {expStageMap.get(e.stage) ?? e.stage}
                        </span>
                      )
                    )}
                    <span className="font-mono text-sm text-stone-950">
                      {formatCurrency(Number(e.amount), e.currency)}
                    </span>
                    {isOwner && e.status === "for_approval" && (
                      <form action={approveExpense}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button
                          type="submit"
                          title="Schválit"
                          className="flex size-8 items-center justify-center text-emerald-600 transition-colors hover:bg-emerald-600 hover:text-white cursor-pointer"
                        >
                          <Check className="size-4" />
                        </button>
                      </form>
                    )}
                    {isOwner && (
                      <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <EditExpenseForm
                          expense={{
                            id: e.id,
                            projectId: project.id,
                            title: e.title,
                            kind: e.kind,
                            category: e.category,
                            currency: e.currency,
                            amount: Number(e.amount),
                            hours: e.hours != null ? Number(e.hours) : null,
                            rate: e.rate != null ? Number(e.rate) : null,
                            date: e.date.toISOString().slice(0, 10),
                            dueDate: e.dueDate
                              ? e.dueDate.toISOString().slice(0, 10)
                              : null,
                            variableSymbol: e.variableSymbol,
                            paid: e.paid,
                            description: e.description,
                            vendorId: e.vendorId,
                            subProjectId: e.subProjectId,
                            stage: e.stage,
                          }}
                          vendors={accountVendors.map((v) => ({
                            id: v.id,
                            name: v.name,
                            hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
                          }))}
                          categories={categories}
                          subProjects={subs.map((s) => ({ id: s.id, name: s.name }))}
                          statuses={expenseStatuses}
                        />
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
            </>
          )}
        </section>

        {/* Dodavatelé + dokumenty – jen v rootu projektu, pod tlačítkem (#14) */}
        {sub === null && (
        <div className="order-1">
          <Collapsible
            title={`Dodavatelé & dokumenty · ${project.vendors.length} / ${project.documents.length}`}
          >
            <div className="grid gap-8 md:grid-cols-2">
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
              <h2 className="kicker">
                Dokumenty · {project.documents.length}
                {onlyMine ? " · jen tvoje" : ""}
              </h2>
            </div>
            {isOwner && <UploadForm projectId={project.id} types={docTypes} />}

            {docTypesPresent.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link href={`/projects/${project.id}`} className={chipClass(!docFilter)}>
                  Vše
                </Link>
                {docTypesPresent.map((t) => (
                  <Link
                    key={t.value}
                    href={`/projects/${project.id}?docType=${t.value}`}
                    className={chipClass(docFilter === t.value)}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
            )}

            {shownDocs.length > 0 ? (
              <ul className="mt-3">
                {shownDocs.map((d) => (
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
                        {docTypeMap.get(d.type) ?? d.type} · {formatBytes(d.size)}
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
            ) : (
              project.documents.length > 0 && (
                <p className="mt-3 text-sm text-stone-500">
                  Žádné dokumenty tohoto typu.
                </p>
              )
            )}
          </section>
            </div>
          </Collapsible>
        </div>
        )}
      </div>

      {/* Žádanky */}
      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between border-b border-stone-300/80 pb-2">
          <h2 className="kicker">
            Žádanky · {levelRequests.length}
            {onlyMine ? " · jen tvoje" : ""}
          </h2>
          {canAdd && (
            <NewRequestForm
              projectId={project.id}
              subProjectId={sub ?? undefined}
              vendors={accountVendors.map((v) => ({ id: v.id, name: v.name }))}
              categories={categories}
            />
          )}
        </div>
        {levelRequests.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">Zatím žádné žádanky.</p>
        ) : (
          <ul>
            {levelRequests.map((r) => (
              <li
                key={r.id}
                className="group border-b border-stone-200 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-950">{r.title}</p>
                    <p className="kicker mt-0.5">
                      {r.quantity != null
                        ? `${Number(r.quantity)} ${unitLabel(r.unit)} · `
                        : ""}
                      {catMap.get(r.category) ?? r.category}
                      {r.vendor ? ` · ${r.vendor.name}` : " · dodavatel neurčen"}
                      {r.price != null ? ` · ${formatCurrency(Number(r.price))}` : ""}
                      {r.requiredDate ? ` · do ${formatDate(r.requiredDate)}` : ""}
                      {` · zadal ${r.createdBy.name ?? r.createdBy.email ?? "?"}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOwner ? (
                      <RequestStatusSelect
                        projectId={project.id}
                        id={r.id}
                        status={r.status}
                        statuses={reqStatuses}
                      />
                    ) : (
                      <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                        {reqStatusMap.get(r.status) ?? requestStatusLabel(r.status)}
                      </span>
                    )}
                    {isOwner && r.vendorId && r.price != null && (
                      <form action={createExpenseFromRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button
                          type="submit"
                          title="Založit výdaj ze žádanky"
                          className="whitespace-nowrap border border-stone-300 px-2 py-1 text-[11px] text-stone-600 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white cursor-pointer"
                        >
                          → Výdaj
                        </button>
                      </form>
                    )}
                    {isOwner && (
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">
                        <DeleteButton
                          action={deleteRequest}
                          fields={{ id: r.id, projectId: project.id }}
                          confirm="Smazat tuto žádanku?"
                        />
                      </span>
                    )}
                  </div>
                </div>

                <OffersPanel
                  requestId={r.id}
                  isOwner={isOwner}
                  canAdd={canAdd}
                  vendors={offerVendorItems}
                  statuses={offerStatuses}
                  offers={r.offers.map((o) => ({
                    id: o.id,
                    vendorId: o.vendorId,
                    vendorName: o.vendorName,
                    vendorLabel:
                      o.vendor?.name ?? o.vendorName ?? "Dodavatel neurčen",
                    price: o.price != null ? Number(o.price) : null,
                    deliveryDate: o.deliveryDate
                      ? o.deliveryDate.toISOString().slice(0, 10)
                      : null,
                    note: o.note,
                    status: o.status,
                    selected: o.selected,
                    canEdit:
                      isOwner || (role === "active" && o.createdById === user.id),
                  }))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
