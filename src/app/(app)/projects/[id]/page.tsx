import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Folder, CalendarRange, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getProjectAccess } from "@/server/access";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { ProjectIcon } from "@/components/projects/project-icon";
import { ProjectSettings } from "@/components/projects/project-settings";
import { Collapsible } from "@/components/app/collapsible";
import { CollapsibleSection } from "@/components/app/collapsible-section";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExportExpensesButton } from "@/components/expenses/export-expenses-button";
import { IncomeSection } from "@/components/incomes/income-section";
import { ListFilters } from "@/components/ui/list-filters";
import { EscBack } from "@/components/app/esc-back";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { RequestStatusSelect } from "@/components/requests/request-status-select";
import { OffersPanel } from "@/components/requests/offers-panel";
import { NewSubProjectForm } from "@/components/subprojects/new-subproject-form";
import { EditSubProjectForm } from "@/components/subprojects/edit-subproject-form";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { CatalogGenerateDialog } from "@/components/catalog/catalog-generate-dialog";
import { TaskCatalogFillDialog } from "@/components/catalog/task-catalog-fill-dialog";
import { EditTaskForm } from "@/components/tasks/edit-task-form";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { TaskDoneCheckbox } from "@/components/tasks/task-done-checkbox";
import { UploadForm } from "@/components/documents/upload-form";
import { deleteProject } from "@/server/actions/projects";
import { deleteSubProject } from "@/server/actions/subprojects";
import { deleteTask } from "@/server/actions/tasks";
import { deleteDocument } from "@/server/actions/documents";
import { createExpenseFromRequest, deleteRequest } from "@/server/actions/requests";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  requestStatusLabel,
  roleLabel,
  taskStatusLabel,
  unitLabel,
  priorityLabel,
  priorityColor,
  REQUEST_FORECAST_STATUSES,
} from "@/lib/constants";
import { computeForecastContribs } from "@/lib/forecast";
import { colorClasses } from "@/lib/status-colors";
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

  const access = await getProjectAccess(id, user);
  if (!access) notFound();
  const role = access.role;
  const scopeSubIds = access.scopeSubIds; // null = celý projekt
  const isOwner = role === "owner";
  // Spolusprávce (owner|member) edituje veškerý obsah; jen owner spravuje
  // nastavení projektu, členy a mazání projektu.
  const isManager = role === "owner" || role === "member";
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
        incomes: {
          orderBy: { date: "desc" },
          include: {
            subProject: { select: { name: true } },
            createdBy: { select: { name: true, email: true } },
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
        subProjects: {
          orderBy: { createdAt: "asc" },
          include: { memberships: true },
        },
        requests: {
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          include: {
            vendor: { select: { name: true } },
            createdBy: { select: { name: true, email: true } },
            offers: {
              orderBy: [
                { selected: "desc" },
                { score: { sort: "desc", nulls: "last" } },
                { price: "asc" },
                { createdAt: "asc" },
              ],
              include: {
                vendor: { select: { name: true } },
                documents: {
                  select: { id: true, originalName: true },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
        },
        tasks: {
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          include: {
            createdBy: { select: { name: true, email: true } },
            dependsOn: {
              include: {
                dependsOn: { select: { id: true, title: true, status: true } },
              },
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

  // Dodavatel s přístupem jen k jedné složce: pusť ho rovnou do ní (ne na root projektu)
  if (scopeSubIds && scopeSubIds.length === 1 && sub === null) {
    redirect(`/projects/${id}?sub=${scopeSubIds[0]}`);
  }
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

  // Rozsah přístupu (per-subprojekt): povolené subprojekty + všechny jejich pod-složky
  const childrenOf = new Map<string, string[]>();
  for (const s of subs)
    if (s.parentId) {
      const a = childrenOf.get(s.parentId) ?? [];
      a.push(s.id);
      childrenOf.set(s.parentId, a);
    }
  let scopeSet: Set<string> | null = null;
  if (scopeSubIds) {
    scopeSet = new Set<string>();
    const stack = [...scopeSubIds];
    while (stack.length) {
      const x = stack.pop()!;
      if (scopeSet.has(x)) continue;
      scopeSet.add(x);
      (childrenOf.get(x) ?? []).forEach((c) => stack.push(c));
    }
  }

  const myEmail = user.email?.toLowerCase();
  // Dodavatelé v evidenci vlastníka se stejným e-mailem (kde "se ho to týká")
  const myVendorIds = new Set<string>(
    onlyMine && myEmail
      ? (
          await prisma.vendor.findMany({
            where: { ownerId: project.ownerId, email: myEmail },
            select: { id: true },
          })
        ).map((v) => v.id)
      : [],
  );

  // Viditelné položky: aktivní dodavatel vidí své záznamy + kde je uveden jako
  // dodavatel; úkoly i ty přiřazené na jeho e-mail.
  const visExpenses = onlyMine
    ? project.expenses.filter(
        (e) =>
          e.createdById === user.id ||
          (!!e.vendorId && myVendorIds.has(e.vendorId)),
      )
    : project.expenses;
  const visRequests = onlyMine
    ? project.requests.filter(
        (r) =>
          r.createdById === user.id ||
          (!!r.vendorId && myVendorIds.has(r.vendorId)),
      )
    : project.requests;
  const visTasks = onlyMine
    ? project.tasks.filter(
        (t) =>
          t.createdById === user.id ||
          (!!t.assigneeEmail && t.assigneeEmail === myEmail),
      )
    : project.tasks;

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

  // Příjmy: vlastník/člen vidí vše; aktivní dodavatel jen své záznamy.
  const visIncomes = onlyMine
    ? project.incomes.filter((i) => i.createdById === user.id)
    : project.incomes;
  const incomeTotal = visIncomes.reduce((s, i) => s + Number(i.amount), 0);
  const incomeBySub = new Map<string, number>();
  for (const i of visIncomes) {
    if (!i.subProjectId) continue;
    const amt = Number(i.amount);
    for (const sid of [i.subProjectId, ...ancestorsOf(i.subProjectId)]) {
      incomeBySub.set(sid, (incomeBySub.get(sid) ?? 0) + amt);
    }
  }

  // Forecast: očekávané budoucí výdaje = cena potvrzené žádanky − již navázané
  // reálné výdaje. (Aktivní dodavatel rozpočet nevidí → forecast 0.)
  // Model (1): forecast se offsetuje na ÚROVNI ÚKOLU. Výdaj navázaný na úkol snižuje
  // forecast toho úkolu (součet jeho žádanek); výdaj navázaný jen na žádanku (bez
  // úkolu) snižuje forecast té žádanky. Tak párování reálných výdajů snižuje forecast.
  const realByTask = new Map<string, number>();
  const realByReq = new Map<string, number>();
  for (const e of project.expenses) {
    const amt = Number(e.amount);
    if (e.taskId) realByTask.set(e.taskId, (realByTask.get(e.taskId) ?? 0) + amt);
    else if (e.requestId) realByReq.set(e.requestId, (realByReq.get(e.requestId) ?? 0) + amt);
  }
  const forecastBySub = new Map<string, number>();
  let forecastTotal = 0;
  const addForecast = (amount: number, subId: string | null) => {
    if (amount <= 0) return;
    forecastTotal += amount;
    if (subId) for (const sid of [subId, ...ancestorsOf(subId)]) forecastBySub.set(sid, (forecastBySub.get(sid) ?? 0) + amount);
  };
  if (!onlyMine) {
    const fcReqs = project.requests
      .filter((r) => REQUEST_FORECAST_STATUSES.includes(r.status) && r.price != null)
      .map((r) => ({
        price: Number(r.price),
        taskId: r.taskId,
        subId: r.subProjectId,
        realOnRequest: realByReq.get(r.id) ?? 0,
      }));
    const fcTasks = project.tasks.map((t) => ({ id: t.id, parentId: t.parentId }));
    for (const c of computeForecastContribs(fcReqs, fcTasks, realByTask)) addForecast(c.amount, c.subId);
  }

  // Aktivní dodavatel: viditelné složky podle rozsahu, jinak jen svoje
  let visibleSubIds: Set<string> | null = null;
  if (onlyMine) {
    const set = new Set<string>();
    if (scopeSet) {
      // per-subprojekt přístup: povolené složky + nadřazené (kvůli navigaci)
      for (const id of scopeSet) {
        set.add(id);
        ancestorsOf(id).forEach((a) => set.add(a));
      }
    } else {
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

  // Na této úrovni smí dodavatel s per-subprojekt přístupem vidět/přidávat
  // jen je-li úroveň v jeho rozsahu (root a nadřazené složky jsou jen k navigaci).
  const levelInScope = !scopeSet || (sub != null && scopeSet.has(sub));
  const canAdd = (role === "owner" || role === "active" || role === "member") && levelInScope;

  const levelExpenses = levelInScope
    ? visExpenses.filter((e) => (e.subProjectId ?? null) === (sub ?? null))
    : [];
  const levelRequests = levelInScope
    ? visRequests.filter((r) => (r.subProjectId ?? null) === (sub ?? null))
    : [];
  const levelTasks = levelInScope
    ? visTasks.filter((t) => (t.subProjectId ?? null) === (sub ?? null))
    : [];
  const levelIncomes = levelInScope
    ? visIncomes.filter((i) => (i.subProjectId ?? null) === (sub ?? null))
    : [];
  const incomeRows = levelIncomes.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    amount: Number(i.amount),
    currency: i.currency,
    category: i.category,
    date: i.date.toISOString().slice(0, 10),
    subProjectName: i.subProject?.name ?? null,
  }));

  // Fáze + dílčí úkoly (jedna úroveň vnoření)
  const taskChildren = new Map<string, typeof levelTasks>();
  for (const t of levelTasks)
    if (t.parentId) {
      const a = taskChildren.get(t.parentId) ?? [];
      a.push(t);
      taskChildren.set(t.parentId, a);
    }
  const taskPhases = levelTasks.filter((t) => t.kind === "phase");
  const orderedTasks: { t: (typeof levelTasks)[number]; level: number }[] = [];
  for (const ph of taskPhases) {
    orderedTasks.push({ t: ph, level: 0 });
    for (const ch of taskChildren.get(ph.id) ?? []) orderedTasks.push({ t: ch, level: 1 });
  }
  for (const t of levelTasks)
    if (t.kind !== "phase" && !t.parentId) orderedTasks.push({ t, level: 0 });
  const phaseOptions = taskPhases.map((p) => ({ id: p.id, title: p.title }));
  const isTaskDone = (st: string) => st === "done" || st === "cancelled";
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

  const expenseItems = shownExpenses.map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    categoryLabel: catMap.get(e.category) ?? e.category,
    dateLabel: formatDate(e.date),
    vendorName: e.vendor?.name ?? null,
    hours: e.hours != null ? Number(e.hours) : null,
    rate: e.rate != null ? Number(e.rate) : null,
    amount: Number(e.amount),
    currency: e.currency,
    stage: e.stage,
    status: e.status,
    paid: e.stage === "uhrazeno",
    exported: !!e.exportedAt,
    dueLabel: e.dueDate ? formatDate(e.dueDate) : null,
    overdue: e.stage !== "uhrazeno" && !!e.dueDate && new Date(e.dueDate) < todayStart,
    hasBank: Boolean(e.vendor?.bankAccount),
    docs: e.documents.map((d) => ({ id: d.id, originalName: d.originalName })),
    createdByLabel: e.createdBy.name ?? e.createdBy.email ?? "?",
    edit: {
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
      dueDate: e.dueDate ? e.dueDate.toISOString().slice(0, 10) : null,
      variableSymbol: e.variableSymbol,
      description: e.description,
      vendorId: e.vendorId,
      subProjectId: e.subProjectId,
      stage: e.stage,
    },
  }));

  // Filtrace + řazení žádanek (název, datum vytvoření; řazení dle data / ceny)
  const rq = (typeof sp?.rq === "string" ? sp.rq : "").trim().toLowerCase();
  const rfrom = typeof sp?.rfrom === "string" && sp.rfrom ? new Date(sp.rfrom) : null;
  const rtoRaw = typeof sp?.rto === "string" && sp.rto ? new Date(sp.rto) : null;
  if (rtoRaw) rtoRaw.setHours(23, 59, 59, 999);
  const rsort = sp?.rsort === "price" ? "price" : "date";
  const rdir = sp?.rdir === "asc" ? "asc" : "desc";

  let shownRequests = levelRequests;
  if (rq) shownRequests = shownRequests.filter((r) => r.title.toLowerCase().includes(rq));
  if (rfrom && !isNaN(rfrom.getTime()))
    shownRequests = shownRequests.filter((r) => r.createdAt >= rfrom);
  if (rtoRaw && !isNaN(rtoRaw.getTime()))
    shownRequests = shownRequests.filter((r) => r.createdAt <= rtoRaw);
  const rsign = rdir === "asc" ? 1 : -1;
  shownRequests = [...shownRequests].sort((a, b) =>
    rsort === "price"
      ? (Number(a.price ?? 0) - Number(b.price ?? 0)) * rsign
      : (a.createdAt.getTime() - b.createdAt.getTime()) * rsign,
  );
  const requestFilterActive = Boolean(rq || rfrom || rtoRaw);

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

  const accountVendors = canAdd
    ? await prisma.vendor.findMany({
        where: {},
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, hourlyRate: true },
      })
    : [];

  const [reqStatuses, offerStatuses, expenseStatuses, taskStatuses] =
    await Promise.all([
      getStatuses("request"),
      getStatuses("offer"),
      getStatuses("expense"),
      getStatuses("task"),
    ]);
  const reqStatusMap = new Map(reqStatuses.map((s) => [s.key, s.label]));
  const taskStatusMap = new Map(taskStatuses.map((s) => [s.key, s.label]));
  const taskColorMap = new Map(taskStatuses.map((s) => [s.key, s.color]));
  const statusColor = (st: string) => taskColorMap.get(st) ?? "stone";
  const offerVendorItems = accountVendors.map((v) => ({ id: v.id, label: v.name }));

  // Dodavatel se stejným e-mailem jako přihlášený uživatel → předvyplní se u výdaje.
  // (myEmail je definováno výše.)
  const myVendorId = myEmail
    ? accountVendors.find((v) => v.email?.toLowerCase() === myEmail)?.id
    : undefined;

  // Našeptávání činností: unikátní názvy výdajů z celého projektu (napříč dodavateli).
  const titleRows = canAdd
    ? await prisma.expense.findMany({
        where: { projectId: id },
        select: { title: true },
        distinct: ["title"],
        orderBy: { title: "asc" },
      })
    : [];
  const titleSuggestions = titleRows.map((t) => t.title).filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl">
      {currentSub && (
        <EscBack
          href={
            currentSub.parentId
              ? `/projects/${project.id}?sub=${currentSub.parentId}`
              : `/projects/${project.id}`
          }
        />
      )}
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
              <p className="kicker">{currentSub ? project.name : typeLabel}</p>
              {!isOwner && (
                <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                  {roleLabel(role)}
                </span>
              )}
            </div>
            <h1 className="display mt-1 text-4xl text-stone-950">
              {currentSub ? currentSub.name : project.name}
            </h1>
            {(currentSub ? currentSub.description : project.description) && (
              <p className="mt-2 max-w-md text-sm text-stone-500">
                {currentSub ? currentSub.description : project.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-stretch gap-3">
          <Link
            href={`/projects/${project.id}/prilohy${sub ? `?sub=${sub}` : ""}`}
            className="flex items-center gap-2 border border-stone-300 px-4 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
            title="Přílohy (skeny) – přehled a stažení za období"
          >
            <Paperclip className="size-4" />
            Přílohy
          </Link>
          <Link
            href={`/projects/${project.id}/planning${sub ? `?sub=${sub}` : ""}`}
            className="flex items-center gap-2 border border-stone-300 px-4 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
            title="Plánování (Gantt) pro tuto úroveň"
          >
            <CalendarRange className="size-4" />
            Plánování
          </Link>
          {(() => {
            const expLevel = currentSub ? spentBySub.get(currentSub.id) ?? 0 : total;
            const incLevel = currentSub ? incomeBySub.get(currentSub.id) ?? 0 : incomeTotal;
            const fcLevel = currentSub ? forecastBySub.get(currentSub.id) ?? 0 : forecastTotal;
            const saldo = incLevel - expLevel;
            const expSaldo = incLevel - expLevel - fcLevel;
            const hasExtra = incLevel > 0 || incomeTotal > 0 || fcLevel > 0;
            return (
              <div className="bg-stone-950 px-6 py-4 text-right text-white shadow-lift">
                <p className="kicker !text-stone-400">
                  {currentSub ? "Složka — výdaje" : "Výdaje"}
                </p>
                <p className="display mt-1 text-2xl">{formatCurrency(expLevel)}</p>
                {folders.length > 0 && (
                  <p className="mt-1 text-xs text-stone-400">
                    přímo zde {formatCurrency(levelTotal)}
                  </p>
                )}
                {hasExtra && (
                  <div className="mt-2 space-y-0.5 border-t border-stone-700 pt-2 text-xs">
                    {(incLevel > 0 || incomeTotal > 0) && (
                      <p className="flex items-center justify-between gap-4 text-stone-400">
                        <span>Příjmy</span>
                        <span className="font-mono text-emerald-400">{formatCurrency(incLevel)}</span>
                      </p>
                    )}
                    <p className="flex items-center justify-between gap-4">
                      <span className="text-stone-400">Saldo</span>
                      <span className={`font-mono ${saldo < 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {formatCurrency(saldo)}
                      </span>
                    </p>
                    {fcLevel > 0 && (
                      <>
                        <p className="flex items-center justify-between gap-4 text-stone-400">
                          <span>Forecast výdajů</span>
                          <span className="font-mono text-amber-400">{formatCurrency(fcLevel)}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4">
                          <span className="text-stone-400">Oček. saldo</span>
                          <span className={`font-mono ${expSaldo < 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {formatCurrency(expSaldo)}
                          </span>
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {isOwner && (
            <div className="flex items-stretch gap-2">
              {currentSub ? (
                <EditSubProjectForm
                  variant="button"
                  sub={{
                    id: currentSub.id,
                    projectId: project.id,
                    name: currentSub.name,
                    description: currentSub.description,
                    budget: currentSub.budget != null ? Number(currentSub.budget) : null,
                  }}
                  members={currentSub.memberships.map((m) => ({
                    email: m.email,
                    role: m.role,
                  }))}
                />
              ) : (
                <ProjectSettings
                  project={{
                    id: project.id,
                    name: project.name,
                    type: project.type,
                    description: project.description,
                    defaultKind: project.defaultKind,
                    defaultCategory: project.defaultCategory,
                    defaultCurrency: project.defaultCurrency,
                  }}
                  types={[...typeMap.entries()].map(([key, label]) => ({ key, label }))}
                  categories={categories}
                  members={project.memberships.map((m) => ({
                    email: m.email,
                    role: m.role,
                  }))}
                />
              )}
              <DeleteButton
                action={deleteProject}
                fields={{ id: project.id }}
                confirm={`Smazat projekt „${project.name}" včetně všech výdajů a dokumentů?`}
                className="flex w-10 items-center justify-center border border-stone-300 text-stone-400 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white cursor-pointer"
              />
            </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((s) => {
              const spent = spentBySub.get(s.id) ?? 0;
              const budget = s.budget != null ? Number(s.budget) : null;
              const over = budget != null && spent > budget;
              return (
                <div
                  key={s.id}
                  className="group relative border border-stone-200 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
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
                      <span className="kicker">{childCount(s.id)} pod</span>
                      <span
                        className={`font-mono text-sm ${over ? "text-red-600" : "text-stone-950"}`}
                      >
                        {formatCurrency(spent)}
                        {budget != null ? ` / ${formatCurrency(budget)}` : ""}
                      </span>
                    </div>
                  </Link>
                  {(isManager || s.createdById === user.id) && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <EditSubProjectForm
                        sub={{
                          id: s.id,
                          projectId: project.id,
                          name: s.name,
                          description: s.description,
                          budget: s.budget != null ? Number(s.budget) : null,
                        }}
                        members={s.memberships.map((m) => ({
                          email: m.email,
                          role: m.role,
                        }))}
                      />
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
        {/* Příjmy (saldo = příjmy − výdaje) */}
        <IncomeSection
          projectId={project.id}
          subProjectId={sub ?? undefined}
          incomes={incomeRows}
          canAdd={canAdd}
          canManage={isManager}
        />

        {/* Výdaje */}
        <CollapsibleSection
          className="order-2"
          storageKey={`dms-sec:${project.id}:${sub ?? "root"}:expenses`}
          defaultOpen
          title={
            <h2 className="kicker">
              Výdaje · {shownExpenses.length}
              {expenseFilterActive ? ` z ${levelExpenses.length}` : ""}
              {onlyMine ? " · jen tvoje" : ""}
            </h2>
          }
          actions={
            canAdd && (
              <NewExpenseForm
                projectId={project.id}
                subProjectId={sub ?? undefined}
                subProjects={subs.map((s) => ({ id: s.id, name: s.name }))}
                myVendorId={myVendorId}
                titleSuggestions={titleSuggestions}
                vendors={accountVendors.map((v) => ({
                  id: v.id,
                  name: v.name,
                  hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
                }))}
                categories={categories}
                docTypes={docTypes}
                statuses={expenseStatuses}
                defaults={{
                  kind: project.defaultKind,
                  category: project.defaultCategory,
                  currency: project.defaultCurrency,
                }}
              />
            )
          }
        >
          {levelExpenses.length === 0 ? (
            <p className="py-8 text-sm text-stone-500">Zatím žádné výdaje.</p>
          ) : (
            <>
            <ListFilters
              prefix="e"
              sortOptions={[
                { value: "date", label: "Datum" },
                { value: "amount", label: "Částka" },
              ]}
            />
            {isManager && shownExpenses.length > 0 && (
              <div className="mb-3 flex justify-end">
                <ExportExpensesButton
                  projectId={project.id}
                  ids={shownExpenses.map((e) => e.id)}
                />
              </div>
            )}
            {shownExpenses.length === 0 ? (
              <p className="py-8 text-sm text-stone-500">
                Nic neodpovídá filtru.
              </p>
            ) : (
            <ExpenseList
              projectId={project.id}
              isOwner={isManager}
              canAdd={canAdd}
              expenses={expenseItems}
              statuses={expenseStatuses}
              vendors={accountVendors.map((v) => ({
                id: v.id,
                name: v.name,
                hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
              }))}
              categories={categories}
              subProjects={subs.map((s) => ({ id: s.id, name: s.name }))}
              docTypes={docTypes}
            />
            )}
            </>
          )}
        </CollapsibleSection>

        {/* Dokumenty (jen v kořeni). Přístup k projektu je v Nastavení. */}
        <div className="order-1 space-y-4">
          {sub === null && (
          <Collapsible
            title={`Dokumenty · ${project.documents.length}`}
          >
          <section>
            {isManager && <UploadForm projectId={project.id} types={docTypes} />}

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
                    {isManager && (
                      <span className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
          </Collapsible>
          )}
        </div>
      </div>

      {/* Žádanky */}
      <CollapsibleSection
        className="mt-12"
        storageKey={`dms-sec:${project.id}:${sub ?? "root"}:requests`}
        defaultOpen
        title={
          <h2 className="kicker">
            Žádanky · {shownRequests.length}
            {requestFilterActive ? ` z ${levelRequests.length}` : ""}
            {onlyMine ? " · jen tvoje" : ""}
          </h2>
        }
        actions={
          canAdd && (
            <NewRequestForm
              projectId={project.id}
              subProjectId={sub ?? undefined}
              vendors={accountVendors.map((v) => ({ id: v.id, name: v.name }))}
              categories={categories}
            />
          )
        }
      >
        {levelRequests.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">Zatím žádné žádanky.</p>
        ) : (
          <>
          <ListFilters
            prefix="r"
            sortOptions={[
              { value: "date", label: "Datum" },
              { value: "price", label: "Cena" },
            ]}
          />
          {shownRequests.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">Nic neodpovídá filtru.</p>
          ) : (
          <ul>
            {shownRequests.map((r) => (
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
                    {isManager ? (
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
                    {isManager && r.vendorId && r.price != null && (
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
                    {isManager && (
                      <span className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
                  isOwner={isManager}
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
                    rating: o.rating,
                    score: o.score,
                    status: o.status,
                    selected: o.selected,
                    canEdit:
                      isManager || (role === "active" && o.createdById === user.id),
                    docs: o.documents.map((d) => ({
                      id: d.id,
                      originalName: d.originalName,
                    })),
                  }))}
                />
              </li>
            ))}
          </ul>
          )}
          </>
        )}
      </CollapsibleSection>

      {/* Úkoly */}
      <CollapsibleSection
        className="mt-12"
        storageKey={`dms-sec:${project.id}:${sub ?? "root"}:tasks`}
        defaultOpen
        title={
          <h2 className="kicker">
            Úkoly · {levelTasks.length}
            {onlyMine ? " · jen tvoje" : ""}
          </h2>
        }
        actions={
          canAdd && (
            <div className="flex items-center gap-2">
              <CatalogGenerateDialog projectId={project.id} subProjectId={sub ?? undefined} phases={phaseOptions} />
              <NewTaskForm
                projectId={project.id}
                subProjectId={sub ?? undefined}
                statuses={taskStatuses}
                phases={phaseOptions}
              />
            </div>
          )
        }
      >
        {levelTasks.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">Zatím žádné úkoly.</p>
        ) : (
          <ul>
            {orderedTasks.map(({ t, level }) => {
              const isPhase = t.kind === "phase";
              const canEditTask = isManager || t.createdById === user.id;
              const canStatusTask =
                canEditTask ||
                (!!t.assigneeEmail && t.assigneeEmail === myEmail);
              const done = isTaskDone(t.status);
              const overdue =
                !done && !!t.dueDate && new Date(t.dueDate) < todayStart;
              const kids = isPhase ? taskChildren.get(t.id) ?? [] : [];
              const kidsDone = kids.filter((k) => isTaskDone(k.status)).length;
              const phaseWarn =
                isPhase &&
                kids.length > 0 &&
                kidsDone < kids.length &&
                !!t.startDate &&
                new Date(t.startDate) <= todayStart;
              const prereqs = (t.dependsOn ?? []).map((d) => d.dependsOn);
              const blockedBy = prereqs.filter((p) => !isTaskDone(p.status));
              const col = colorClasses(statusColor(t.status));
              return (
                <li
                  key={t.id}
                  className={`group flex items-start justify-between gap-3 border-b border-stone-200 py-3.5 ${
                    isPhase ? "bg-stone-50/60" : ""
                  }`}
                  style={level > 0 ? { paddingLeft: `${level * 24}px` } : undefined}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    {canStatusTask && <TaskDoneCheckbox id={t.id} done={done} />}
                    <div className="min-w-0">
                      <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium ${done ? "text-stone-400 line-through" : "text-stone-950"}`}>
                        <span
                          className={`size-2 shrink-0 rounded-full ${col.dot}`}
                          title={taskStatusMap.get(t.status) ?? taskStatusLabel(t.status)}
                        />
                        {isPhase && (
                          <span className="kicker !text-stone-500">Fáze</span>
                        )}
                        {t.title}
                        {isPhase && kids.length > 0 && (
                          <span className="text-[11px] font-normal text-stone-500">
                            {kidsDone}/{kids.length} hotovo
                          </span>
                        )}
                        {t.priority && (
                          <span className={`border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${colorClasses(priorityColor(t.priority)).chip}`}>
                            {priorityLabel(t.priority)}
                          </span>
                        )}
                        {t.profession && (
                          <span className="border border-stone-200 bg-stone-50 px-1.5 py-px text-[10px] font-normal uppercase tracking-wide text-stone-500">
                            {t.profession}
                          </span>
                        )}
                      </p>
                      <p className="kicker mt-0.5">
                        {t.assigneeEmail ? `${t.assigneeEmail} · ` : ""}
                        {t.dueDate ? (
                          <span className={overdue ? "text-red-600" : undefined}>
                            do {formatDate(t.dueDate)}
                          </span>
                        ) : (
                          "bez termínu"
                        )}
                        {t.estimateDays ? ` · odhad ${t.estimateDays} d` : ""}
                        {!done && t.percentDone ? ` · ${t.percentDone} %` : ""}
                        {` · zadal ${t.createdBy.name ?? t.createdBy.email ?? "?"}`}
                      </p>
                      {prereqs.length > 0 && (
                        <p className={`mt-1 text-xs ${blockedBy.length ? "text-red-600" : "text-stone-500"}`}>
                          {blockedBy.length ? "⛔ Čeká na: " : "↳ Navazuje na: "}
                          {prereqs.map((p) => p.title).join(", ")}
                        </p>
                      )}
                      {phaseWarn && (
                        <p className="mt-1 text-xs text-amber-700">
                          ⚠ Fáze začíná, ale dílčí úkoly ještě nejsou hotové.
                        </p>
                      )}
                      {t.description && (
                        <p className="mt-1 max-w-xl text-sm text-stone-500">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canStatusTask ? (
                      <TaskStatusSelect id={t.id} status={t.status} statuses={taskStatuses} />
                    ) : (
                      <span className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${col.chip}`}>
                        {taskStatusMap.get(t.status) ?? taskStatusLabel(t.status)}
                      </span>
                    )}
                    {canEditTask && isPhase && (
                      <CatalogGenerateDialog
                        projectId={project.id}
                        subProjectId={sub ?? undefined}
                        phase={{ id: t.id, title: t.title }}
                      />
                    )}
                    {canEditTask && !isPhase && (
                      <TaskCatalogFillDialog taskId={t.id} taskTitle={t.title} />
                    )}
                    {canEditTask && (
                      <span className="flex items-center gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <EditTaskForm
                          task={{
                            id: t.id,
                            title: t.title,
                            assigneeEmail: t.assigneeEmail,
                            startDate: t.startDate
                              ? t.startDate.toISOString().slice(0, 10)
                              : null,
                            dueDate: t.dueDate
                              ? t.dueDate.toISOString().slice(0, 10)
                              : null,
                            status: t.status,
                            description: t.description,
                            kind: t.kind,
                            parentId: t.parentId,
                            priority: t.priority,
                            profession: t.profession,
                            estimateDays: t.estimateDays,
                            percentDone: t.percentDone,
                            dependsOnIds: prereqs.map((p) => p.id),
                          }}
                          statuses={taskStatuses}
                          phases={phaseOptions}
                        />
                        <DeleteButton
                          action={deleteTask}
                          fields={{ id: t.id }}
                          confirm={isPhase ? "Smazat fázi i s dílčími úkoly?" : "Smazat tento úkol?"}
                        />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
