import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Folder, CalendarRange, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getProjectAccess, getTaskOnlyAccess } from "@/server/access";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/ui/delete-button";
import { ProjectIcon } from "@/components/projects/project-icon";
import { ProjectSettings } from "@/components/projects/project-settings";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExportExpensesButton } from "@/components/expenses/export-expenses-button";
import { IncomeSection } from "@/components/incomes/income-section";
import { ListFilters } from "@/components/ui/list-filters";
import { EscBack } from "@/components/app/esc-back";
import { EditRequestForm, NewRequestForm } from "@/components/requests/new-request-form";
import { RequestStatusSelect } from "@/components/requests/request-status-select";
import { OffersPanel } from "@/components/requests/offers-panel";
import { RequestAttachments } from "@/components/requests/request-attachments";
import { OfferComparison } from "@/components/requests/offer-comparison";
import { PlanAi } from "@/components/planning/plan-ai";
import { planAiProps } from "@/server/plan-ai";
import type { ComparisonResult } from "@/server/extraction";
import { NewSubProjectForm } from "@/components/subprojects/new-subproject-form";
import { EditSubProjectForm } from "@/components/subprojects/edit-subproject-form";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { BulkTaskBar } from "@/components/tasks/bulk-task-bar";
import { TaskRow } from "@/components/tasks/task-row";
import { ACTIVITY_PERIODS, TaskActivity } from "@/components/tasks/task-activity";
import { CatalogGenerateDialog } from "@/components/catalog/catalog-generate-dialog";
import { TaskCatalogFillDialog } from "@/components/catalog/task-catalog-fill-dialog";
import { EditTaskForm } from "@/components/tasks/edit-task-form";
import { parseStatusFilter } from "@/lib/list-filter";
import { extractable } from "@/server/extraction";
import { RememberProject } from "@/components/projects/remember-project";
import { TodoList } from "@/components/tasks/todo-list";
import { UploadForm } from "@/components/documents/upload-form";
import {
  ProjectTabs,
  TabSection,
  parseProjectTab,
  projectHref,
} from "@/components/projects/project-tabs";
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
  REQUEST_FORECAST_STATUSES,
  TASK_DONE_STATUSES,
  isExpensePaid,
  expenseStage,
} from "@/lib/constants";
import { computeForecastContribs } from "@/lib/forecast";
import { getProjectTypeMap } from "@/server/project-types";
import { getExpenseCategories } from "@/server/expense-categories";
import { getDocumentTypes } from "@/server/document-types";
import { getStatuses } from "@/server/statuses";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Uzavřené žádanky – převedené na výdaj nebo zrušené; výchozí filtr je schová. */
const REQUEST_CLOSED_STATUSES = ["schvaleno", "zruseno"];

export default async function ProjectDetailPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const docFilter = typeof sp?.docType === "string" ? sp.docType : null;

  // Dodavatel bez členství, který tu má přidělené úkoly, vidí projekt
  // v režimu „jen moje úkoly“ (role task, jen ke čtení).
  const access = (await getProjectAccess(id, user)) ?? (await getTaskOnlyAccess(id, user));
  if (!access) notFound();
  const role = access.role;
  const scopeSubIds = access.scopeSubIds; // null = celý projekt
  const isOwner = role === "owner";
  // Spolusprávce (owner|member) edituje veškerý obsah; jen owner spravuje
  // nastavení projektu, členy a mazání projektu.
  const isManager = role === "owner" || role === "member";
  // Aktivní dodavatel vidí jen své vlastní záznamy
  const onlyMine = role === "active" || role === "task";
  const taskOnly = role === "task";

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
            documents: {
              select: {
                id: true,
                originalName: true,
                summary: true,
                mimeType: true,
                size: true,
                uploadedById: true,
                extractions: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { id: true, status: true, error: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
            comparisons: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, status: true, prompt: true, error: true, createdAt: true, result: true },
            },
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
            vendor: { select: { name: true, email: true } },
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
  // Dokumenty jsou jen v kořeni projektu – ve složce se spadne na výchozí.
  const requestedTab = parseProjectTab(sp?.tab);
  const tab = requestedTab === "dokumenty" && sub ? parseProjectTab(null) : requestedTab;

  // Dodavatel s přístupem jen k jedné složce: pusť ho rovnou do ní (ne na root projektu)
  if (scopeSubIds && scopeSubIds.length === 1 && sub === null) {
    redirect(projectHref(id, scopeSubIds[0], tab));
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
  const myVendors = myEmail
    ? await prisma.vendor.findMany({
        where: { ownerId: project.ownerId, email: { equals: myEmail, mode: "insensitive" } },
        select: { id: true, hourlyRate: true },
      })
    : [];
  const myVendorIds = new Set<string>(myVendors.map((v) => v.id));
  const rateOf = (vendorId: string) => {
    const r = myVendors.find((v) => v.id === vendorId)?.hourlyRate;
    return r != null ? Number(r) : null;
  };

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
    ? (() => {
        const mine = project.tasks.filter(
          (t) =>
            t.createdById === user.id ||
            (!!t.assigneeEmail && t.assigneeEmail === myEmail) ||
            // úkol přidělený dodavateli se stejným e-mailem (#29)
            (!!t.vendorId && myVendorIds.has(t.vendorId)),
        );
        // + fáze, do kterých moje úkoly patří (souvislosti, jen ke čtení) –
        // bez nich by dílčí úkoly v seznamu vůbec nebyly vidět.
        const parents = new Set(mine.map((t) => t.parentId).filter(Boolean));
        const ids = new Set(mine.map((t) => t.id));
        return [...mine, ...project.tasks.filter((t) => parents.has(t.id) && !ids.has(t.id))];
      })()
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
    // Cena žádanky, jinak vybraná / nejlevnější nabídka (bez cen byl forecast prázdný).
    const reqPrice = (r: (typeof project.requests)[number]) => {
      if (r.price != null) return Number(r.price);
      const priced = r.offers.filter((o) => o.price != null);
      const chosen = priced.find((o) => o.selected) ?? [...priced].sort((x, y) => Number(x.price) - Number(y.price))[0];
      return chosen ? Number(chosen.price) : null;
    };
    const fcReqs = project.requests
      .filter((r) => REQUEST_FORECAST_STATUSES.includes(r.status) && reqPrice(r) != null)
      .map((r) => ({
        price: reqPrice(r)!,
        taskId: r.taskId,
        subId: r.subProjectId,
        realOnRequest: realByReq.get(r.id) ?? 0,
      }));
    // Odhady nákladů v plánu – dokud žádanka k úkolu nemá cenu a úkol není hotový;
    // u fáze jen, když odhad nemá žádný její úkol (viz server/finance.ts).
    const tasksWithReq = new Set(project.requests.filter((r) => reqPrice(r) != null).map((r) => r.taskId).filter(Boolean));
    const kidHasEstimate = new Set(project.tasks.filter((t) => t.parentId && t.costEstimate != null).map((t) => t.parentId));
    for (const t of project.tasks)
      if (
        t.costEstimate != null &&
        !tasksWithReq.has(t.id) &&
        !TASK_DONE_STATUSES.includes(t.status) &&
        !kidHasEstimate.has(t.id)
      )
        fcReqs.push({ price: Number(t.costEstimate), taskId: t.id, subId: t.subProjectId, realOnRequest: 0 });
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
      for (const t of visTasks)
        if (t.subProjectId) {
          set.add(t.subProjectId);
          ancestorsOf(t.subProjectId).forEach((a) => set.add(a));
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
  // Todo list (#28) žije vedle plánu, ne v něm - fáze a termíny se ho netýkají.
  const todoTasks = levelTasks.filter((t) => t.kind === "todo");
  const planTasks = levelTasks.filter((t) => t.kind !== "todo");
  const taskPhases = planTasks.filter((t) => t.kind === "phase");

  /**
   * Filtr úkolů podle stavu (`tst=todo,doing`, víc stavů najednou).
   *
   * Fáze zůstane vidět, když odpovídá sama, nebo když odpovídá některý
   * její dílčí úkol – jinak by dílčí úkoly visely bez souvislosti.
   */
  // Standard filtrů (src/lib/list-filter.ts), prefix "t". Bez parametru
  // stavu jsou vidět jen neukončené úkoly.
  const tstRaw = sp?.tst;
  const tstSel = parseStatusFilter(tstRaw, []);
  const tq = (typeof sp?.tq === "string" ? sp.tq : "").trim().toLowerCase();
  const tfrom = typeof sp?.tfrom === "string" && sp.tfrom ? new Date(sp.tfrom) : null;
  const ttoRaw = typeof sp?.tto === "string" && sp.tto ? new Date(sp.tto) : null;
  if (ttoRaw) ttoRaw.setHours(23, 59, 59, 999);
  const tsort = sp?.tsort === "due" || sp?.tsort === "title" ? sp.tsort : "plan";
  // Přidělení (parametr tas): mine | none | self | p:<e-mail osoby> (řešitel nebo dodavatel s tím e-mailem);
  // starší v:<dodavatel> | a:<e-mail> zůstávají funkční kvůli uloženým odkazům.
  const tas = typeof sp?.tas === "string" ? sp.tas : "";
  const low = (e: string | null | undefined) => e?.toLowerCase() ?? null;
  const personOf = (t: (typeof levelTasks)[number]) => [low(t.assigneeEmail), low(t.vendor?.email)].filter(Boolean) as string[];
  const assignMatch = (t: (typeof levelTasks)[number]) =>
    !tas ||
    (tas === "mine"
      ? (!!t.assigneeEmail && t.assigneeEmail === myEmail) || (!!t.vendorId && myVendorIds.has(t.vendorId))
      : tas === "none"
        ? !t.vendorId && !t.assigneeEmail && !t.selfPerformed
        : tas === "self"
          ? t.selfPerformed
          : tas.startsWith("p:")
            ? personOf(t).includes(tas.slice(2))
            : tas.startsWith("v:")
              ? t.vendorId === tas.slice(2)
              : tas.startsWith("a:")
                ? t.assigneeEmail === tas.slice(2)
                : true);
  const tdir = sp?.tdir === "desc" ? -1 : 1;
  const taskStatusCounts: Record<string, number> = {};
  for (const t of planTasks) taskStatusCounts[t.status] = (taskStatusCounts[t.status] ?? 0) + 1;
  const statusMatch = (t: (typeof levelTasks)[number]) =>
    (typeof tstRaw === "string" ? !tstSel || tstSel.has(t.status) : !TASK_DONE_STATUSES.includes(t.status)) &&
    (!tq || t.title.toLowerCase().includes(tq)) &&
    assignMatch(t) &&
    (!tfrom || (!!t.dueDate && t.dueDate >= tfrom)) &&
    (!ttoRaw || (!!t.startDate ? t.startDate <= ttoRaw : !!t.dueDate && t.dueDate <= ttoRaw));
  const taskFilterActive = typeof tstRaw === "string" || !!tq || !!tfrom || !!ttoRaw || !!tas;
  // Lidé v úkolech: řešitelé a dodavatelé (podle e-mailu) + kdo na úkoly vykazoval.
  // Jméno z evidence dodavatelů, jinak z účtu, jinak e-mail.
  const loggers = await prisma.expense.findMany({
    where: { projectId: project.id, taskId: { not: null } },
    distinct: ["createdById"],
    select: { createdBy: { select: { email: true, name: true } } },
  });
  const peopleMap = new Map<string, string | null>();
  for (const t of levelTasks) {
    if (t.vendor?.email) peopleMap.set(t.vendor.email.toLowerCase(), t.vendor.name);
    if (t.assigneeEmail && !peopleMap.has(t.assigneeEmail.toLowerCase())) peopleMap.set(t.assigneeEmail.toLowerCase(), null);
  }
  for (const l of loggers)
    if (l.createdBy.email && !peopleMap.has(l.createdBy.email.toLowerCase())) peopleMap.set(l.createdBy.email.toLowerCase(), l.createdBy.name);
  const unnamed = [...peopleMap.entries()].filter(([, n]) => !n).map(([e]) => e);
  if (unnamed.length)
    for (const u of await prisma.user.findMany({ where: { email: { in: unnamed, mode: "insensitive" } }, select: { email: true, name: true } }))
      if (u.email && u.name) peopleMap.set(u.email.toLowerCase(), u.name);
  if (myEmail) peopleMap.delete(myEmail.toLowerCase()); // já = „Já“
  const people = [...peopleMap.entries()]
    .map(([email, name]) => ({ email, name: name || email }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const personName = (key: string) =>
    key === "mine" ? "Já" : key.startsWith("p:") ? (people.find((x) => x.email === key.slice(2))?.name ?? key.slice(2)) : null;
  const assignOptions = [
    { value: "mine", label: "Já" },
    ...people.map((x) => ({ value: `p:${x.email}`, label: x.name })),
    { value: "none", label: "Nepřidělené" },
    { value: "self", label: "Svépomocí" },
  ];
  // Pohled Aktivita (tview=akt): kdo co v období udělal
  const tview = sp?.tview === "akt" ? "akt" : "list";
  const tper = (["dnes", "vcera", "tyden", "mesic"] as const).find((x) => x === sp?.tper) ?? "dnes";
  const taskSort = <T extends { title: string; dueDate: Date | null }>(xs: T[]) =>
    tsort === "plan"
      ? xs
      : [...xs].sort((a, b) =>
          tsort === "title"
            ? a.title.localeCompare(b.title, "cs") * tdir
            : ((a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)) * tdir,
        );

  const orderedTasks: { t: (typeof levelTasks)[number]; level: number }[] = [];
  for (const ph of taskSort(taskPhases)) {
    const kids = taskSort((taskChildren.get(ph.id) ?? []).filter(statusMatch));
    if (!statusMatch(ph) && kids.length === 0) continue;
    orderedTasks.push({ t: ph, level: 0 });
    for (const ch of kids) orderedTasks.push({ t: ch, level: 1 });
  }
  for (const t of taskSort(planTasks))
    if (t.kind !== "phase" && !t.parentId && statusMatch(t)) orderedTasks.push({ t, level: 0 });
  const phaseOptions = taskPhases.map((p) => ({ id: p.id, title: p.title }));
  const isTaskDone = (st: string) => TASK_DONE_STATUSES.includes(st);
  // Náklady přímo na této úrovni (mimo podsložky)
  const levelTotal = levelExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Filtrace (název, datum) + řazení (datum / částka) výdajů na této úrovni
  const eq = (typeof sp?.eq === "string" ? sp.eq : "").trim().toLowerCase();
  const efrom = typeof sp?.efrom === "string" && sp.efrom ? new Date(sp.efrom) : null;
  const etoRaw = typeof sp?.eto === "string" && sp.eto ? new Date(sp.eto) : null;
  if (etoRaw) etoRaw.setHours(23, 59, 59, 999);
  const esort = sp?.esort === "amount" ? "amount" : "date";
  const edir = sp?.edir === "asc" ? "asc" : "desc";
  const evendor = typeof sp?.evendor === "string" ? sp.evendor : "";
  const estage = typeof sp?.estage === "string" ? sp.estage : "";

  let shownExpenses = levelExpenses;
  if (eq) shownExpenses = shownExpenses.filter((e) => e.title.toLowerCase().includes(eq));
  if (efrom && !isNaN(efrom.getTime()))
    shownExpenses = shownExpenses.filter((e) => e.date >= efrom);
  if (etoRaw && !isNaN(etoRaw.getTime()))
    shownExpenses = shownExpenses.filter((e) => e.date <= etoRaw);
  if (evendor) shownExpenses = shownExpenses.filter((e) => e.vendorId === evendor);
  if (estage === "__unpaid__")
    // „Neuhrazené" = vše kromě stavu uhrazeno (i výdaje bez nastaveného stavu).
    shownExpenses = shownExpenses.filter((e) => !isExpensePaid(e.stage));
  // expenseStage() bere prázdný stav jako „Nový", takže filtr najde i starší
  // výdaje, které se založily bez stavu.
  else if (estage) shownExpenses = shownExpenses.filter((e) => expenseStage(e.stage) === estage);
  const sign = edir === "asc" ? 1 : -1;
  shownExpenses = [...shownExpenses].sort((a, b) =>
    esort === "amount"
      ? (Number(a.amount) - Number(b.amount)) * sign
      : (a.date.getTime() - b.date.getTime()) * sign,
  );
  const expenseFilterActive = Boolean(eq || efrom || etoRaw || evendor || estage);
  // Součty pro zafiltrované výdaje (celkem + kolik z toho ještě k úhradě).
  const shownTotal = shownExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const shownUnpaidTotal = shownExpenses
    // příjem (záporná částka) není co proplácet – do „k úhradě" nepatří
    .filter((e) => !isExpensePaid(e.stage) && Number(e.amount) > 0)
    .reduce((s, e) => s + Number(e.amount), 0);
  // Volby filtru dodavatele = dodavatelé, co mají na této úrovni výdaj.
  const expVendorOptions = [
    ...new Map(
      levelExpenses.filter((e) => e.vendor).map((e) => [e.vendor!.id, e.vendor!.name]),
    ).entries(),
  ]
    .map(([value, label]) => ({ value, label: label ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label, "cs"));

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
    paid: isExpensePaid(e.stage),
    exported: !!e.exportedAt,
    dueLabel: e.dueDate ? formatDate(e.dueDate) : null,
    overdue: !isExpensePaid(e.stage) && !!e.dueDate && new Date(e.dueDate) < todayStart,
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

  // Stav (standard filtrů, prefix "r"): bez parametru jen neukončené –
  // schválené (převedené na výdaj) a zrušené se schovají.
  const rstRaw = sp?.rst;
  const rstSel = parseStatusFilter(rstRaw, []);
  let shownRequests = levelRequests.filter((r) =>
    typeof rstRaw === "string" ? !rstSel || rstSel.has(r.status) : !REQUEST_CLOSED_STATUSES.includes(r.status),
  );
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
  const requestFilterActive = Boolean(rq || rfrom || rtoRaw || typeof rstRaw === "string" || shownRequests.length !== levelRequests.length);

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
        where: { ownerId: project.ownerId },
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
      <RememberProject projectId={project.id} sub={sub} tab={tab} />
      {currentSub && (
        <EscBack href={projectHref(project.id, currentSub.parentId ?? null, tab)} />
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
            {!currentSub && (project.startDate || project.plannedEnd || project.actualEnd) && (
              <p className="kicker mt-2 flex flex-wrap gap-x-3">
                {project.startDate && <span>začátek {formatDate(project.startDate)}</span>}
                {project.plannedEnd && (
                  <span className={!project.actualEnd && project.plannedEnd < todayStart ? "text-red-600" : undefined}>
                    očekávané dokončení {formatDate(project.plannedEnd)}
                  </span>
                )}
                {project.actualEnd && <span className="text-emerald-700">dokončeno {formatDate(project.actualEnd)}</span>}
              </p>
            )}
            {(currentSub ? currentSub.description : project.description) && (
              <p className="mt-2 max-w-md text-sm text-stone-500">
                {currentSub ? currentSub.description : project.description}
              </p>
            )}
          </div>
        </div>
        {/* Na mobilu se řada zalamuje: box s výdaji nahoře přes celou šířku,
            tlačítka pod ním. Dřív se nezalamovala a stránka byla širší než
            displej (568 px na 390px telefonu). */}
        <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
          {!taskOnly && (
          <Link
            href={`/projects/${project.id}/prilohy${sub ? `?sub=${sub}` : ""}`}
            className="flex items-center gap-2 border border-stone-300 px-4 py-2.5 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white sm:py-0"
            title="Přílohy (skeny) – přehled a stažení za období"
          >
            <Paperclip className="size-4" />
            Přílohy
          </Link>
          )}
          <Link
            href={`/projects/${project.id}/planning${sub ? `?sub=${sub}` : ""}`}
            className="flex items-center gap-2 border border-stone-300 px-4 py-2.5 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white sm:py-0"
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
              <div className="order-first w-full bg-stone-950 px-6 py-4 text-right text-white shadow-lift sm:order-none sm:w-auto">
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
                    startDate: project.startDate?.toISOString().slice(0, 10) ?? null,
                    plannedEnd: project.plannedEnd?.toISOString().slice(0, 10) ?? null,
                    actualEnd: project.actualEnd?.toISOString().slice(0, 10) ?? null,
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
          href={projectHref(project.id, null, tab)}
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
              href={projectHref(project.id, cs.id, tab)}
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
                    href={projectHref(project.id, s.id, tab)}
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

      <ProjectTabs
        projectId={project.id}
        sub={sub}
        active={tab}
        tabs={[
          { key: "vydaje", label: "Výdaje", count: levelExpenses.length },
          { key: "ukoly", label: "Úkoly", count: levelTasks.length },
          { key: "zadanky", label: "Žádanky", count: levelRequests.length },
          { key: "prijmy", label: "Příjmy", count: levelIncomes.length },
          ...(sub === null
            ? [{ key: "dokumenty" as const, label: "Dokumenty", count: project.documents.length }]
            : []),
        ]}
      />

      <div>
        {/* Příjmy (saldo = příjmy − výdaje) */}
        {tab === "prijmy" && (
          <div className="mt-6">
            <IncomeSection
              projectId={project.id}
              subProjectId={sub ?? undefined}
              incomes={incomeRows}
              canAdd={canAdd}
              canManage={isManager}
            />
          </div>
        )}

        {/* Výdaje */}
        {tab === "vydaje" && (
        <TabSection
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
              selects={[
                ...(expVendorOptions.length > 0
                  ? [{ key: "vendor", label: "Dodavatel", options: expVendorOptions }]
                  : []),
                {
                  key: "stage",
                  label: "Stav",
                  options: [
                    { value: "__unpaid__", label: "— Neuhrazené —" },
                    ...expenseStatuses.map((s) => ({ value: s.key, label: s.label })),
                  ],
                },
              ]}
            />
            {shownExpenses.length > 0 && (
              <p className="mb-3 text-xs text-stone-500">
                {/* jsou-li mezi záznamy příjmy (záporné částky), není to prostý
                    součet výdajů, ale saldo – ať to nemate */}
                {shownExpenses.some((e) => Number(e.amount) < 0) ? "Saldo" : "Součet"}
                {expenseFilterActive ? " (filtr)" : ""}:{" "}
                <span className="font-mono text-stone-800">{formatCurrency(shownTotal)}</span>
                {shownUnpaidTotal > 0 && (
                  <>
                    {" · k úhradě "}
                    <span className="font-mono text-stone-800">
                      {formatCurrency(shownUnpaidTotal)}
                    </span>
                  </>
                )}
              </p>
            )}
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
        </TabSection>
        )}

        {/* Dokumenty (jen v kořeni). Přístup k projektu je v Nastavení. */}
        <div>
          {tab === "dokumenty" && sub === null && (
          <TabSection title={<h2 className="kicker">Dokumenty · {project.documents.length}</h2>}>
          <section>
            {isManager && <UploadForm projectId={project.id} types={docTypes} />}

            {docTypesPresent.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link href={`/projects/${project.id}?tab=dokumenty`} className={chipClass(!docFilter)}>
                  Vše
                </Link>
                {docTypesPresent.map((t) => (
                  <Link
                    key={t.value}
                    href={`/projects/${project.id}?tab=dokumenty&docType=${t.value}`}
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
          </TabSection>
          )}
        </div>
      </div>

      {/* Žádanky */}
      {tab === "zadanky" && (
      <TabSection
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
            statuses={reqStatuses.map((st) => ({
              key: st.key,
              label: st.label,
              count: levelRequests.filter((x) => x.status === st.key).length,
            }))}
            defaultStatuses={reqStatuses.map((st) => st.key).filter((k) => !REQUEST_CLOSED_STATUSES.includes(k))}
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
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-60">
                    {(isManager || (canAdd && r.createdById === user.id)) ? (
                      <EditRequestForm
                        projectId={project.id}
                        vendors={accountVendors.map((v) => ({ id: v.id, name: v.name }))}
                        categories={categories}
                        request={{
                          id: r.id,
                          title: r.title,
                          description: r.description,
                          quantity: r.quantity != null ? Number(r.quantity) : null,
                          unit: r.unit,
                          category: r.category,
                          price: r.price != null ? Number(r.price) : null,
                          vendorId: r.vendorId,
                          requiredDate: r.requiredDate ? r.requiredDate.toISOString().slice(0, 10) : null,
                        }}
                        trigger={
                          <span className="text-sm font-medium text-stone-950 underline-offset-2 hover:underline">
                            {r.title}
                          </span>
                        }
                      />
                    ) : (
                      <p className="text-sm font-medium text-stone-950">{r.title}</p>
                    )}
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
                    {r.offers.length > 0 &&
                      (() => {
                        // Průběžné vyhodnocení: kolik nabídek, nejlevnější, vybraná.
                        const priced = r.offers.filter((o) => o.price != null);
                        const best = priced.sort((x, y) => Number(x.price) - Number(y.price))[0];
                        const chosen = r.offers.find((o) => o.selected);
                        const who = (o: (typeof r.offers)[number]) => o.vendor?.name ?? o.vendorName ?? "?";
                        const n = r.offers.length;
                        return (
                          <p className="mt-1 text-xs text-stone-600">
                            {n} {n === 1 ? "nabídka" : n < 5 ? "nabídky" : "nabídek"}
                            {best ? ` · nejlevnější ${formatCurrency(Number(best.price))} (${who(best)})` : ""}
                            {chosen ? ` · vybraná: ${who(chosen)}` : ""}
                          </p>
                        );
                      })()}
                    {r.description && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-stone-600">
                        {r.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
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

                <RequestAttachments
                  projectId={project.id}
                  requestId={r.id}
                  canAdd={isManager || (canAdd && r.createdById === user.id)}
                  docs={r.documents.map((d) => ({
                    id: d.id,
                    originalName: d.originalName,
                    summary: d.summary,
                    isEmail:
                      d.mimeType === "message/rfc822" ||
                      d.mimeType === "application/vnd.ms-outlook",
                    size: d.size,
                    canDelete: isManager || d.uploadedById === user.id,
                    ai: d.extractions[0]
                      ? { id: d.extractions[0].id, status: d.extractions[0].status, error: d.extractions[0].error }
                      : null,
                    canExtract: isManager && extractable(d.mimeType, d.originalName),
                  }))}
                />

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
                    planTaskCount: Array.isArray(o.planTasks) ? o.planTasks.length : 0,
                    tasksCreated: !!o.tasksCreatedAt,
                    canEdit:
                      isManager || (role === "active" && o.createdById === user.id),
                    docs: o.documents.map((d) => ({
                      id: d.id,
                      originalName: d.originalName,
                    })),
                  }))}
                />

                <OfferComparison
                  requestId={r.id}
                  offerCount={r.offers.length}
                  canRun={isManager}
                  comparison={
                    r.comparisons[0]
                      ? {
                          id: r.comparisons[0].id,
                          status: r.comparisons[0].status,
                          prompt: r.comparisons[0].prompt,
                          error: r.comparisons[0].error,
                          createdAt: r.comparisons[0].createdAt.toISOString(),
                          result: r.comparisons[0].result as unknown as ComparisonResult | null,
                        }
                      : null
                  }
                />
              </li>
            ))}
          </ul>
          )}
          </>
        )}
      </TabSection>
      )}

      {/* Úkoly */}
      {tab === "ukoly" && (
      <>
        {/* Jeden standardní filtr úkolů (jako všude): pohled, kdo, stav vždy vidět; hledání a termíny ve Filtru */}
        <div className="mt-6">
          {tview === "akt" ? (
            <ListFilters
              prefix="t"
              search={false}
              dates={false}
              selects={[
                { key: "view", label: "Pohled", chips: true, allLabel: "Seznam úkolů", options: [{ value: "akt", label: "Aktivita – kdo co udělal" }] },
                { key: "as", label: "Kdo", chips: true, allLabel: "Všichni", options: assignOptions.filter((o) => o.value !== "none" && o.value !== "self") },
                {
                  key: "per",
                  label: "Kdy",
                  chips: true,
                  allLabel: "Dnes",
                  options: ACTIVITY_PERIODS.filter((x) => x.key !== "dnes").map((x) => ({ value: x.key, label: x.label })),
                },
              ]}
            />
          ) : (
            <ListFilters
              prefix="t"
              placeholder="Hledat úkol…"
              sortOptions={[
                { value: "plan", label: "Pořadí plánu" },
                { value: "due", label: "Termín" },
                { value: "title", label: "Název" },
              ]}
              selects={[
                { key: "view", label: "Pohled", chips: true, allLabel: "Seznam úkolů", options: [{ value: "akt", label: "Aktivita – kdo co udělal" }] },
                { key: "as", label: "Kdo", chips: true, allLabel: "Všichni", options: assignOptions },
              ]}
              statuses={taskStatuses.map((st) => ({ key: st.key, label: st.label, color: st.color ?? null, count: taskStatusCounts[st.key] ?? 0 }))}
              defaultStatuses={taskStatuses.map((st) => st.key).filter((k) => !TASK_DONE_STATUSES.includes(k))}
            />
          )}
        </div>
        {tview === "akt" ? (
          <TaskActivity
            projectId={project.id}
            period={tper}
            person={tas === "mine" ? "mine" : tas.startsWith("p:") ? tas.slice(2) : null}
            personName={tas ? personName(tas) : null}
            myUserId={user.id}
            myEmail={myEmail ?? null}
            statusLabel={(k) => taskStatusMap.get(k) ?? taskStatusLabel(k)}
          />
        ) : (
        <>
        {/* Todo nad plánem: nadpis Plán patří k seznamu pod ním, ne k todo. */}
        <div className="mt-6">
          {(canAdd || todoTasks.length > 0) && (
            <TodoList
              projectId={project.id}
              subProjectId={sub ?? undefined}
              canAdd={canAdd}
              vendors={accountVendors.map((v) => ({ id: v.id, name: v.name }))}
              items={todoTasks.filter(assignMatch).map((t) => {
                const canEditTodo = isManager || t.createdById === user.id;
                return {
                  id: t.id,
                  title: t.title,
                  priority: t.priority,
                  ready: t.ready,
                  done: isTaskDone(t.status),
                  vendorId: t.vendorId,
                  vendorName: t.vendor?.name ?? null,
                  createdAt: t.createdAt.toISOString(),
                  canEdit: canEditTodo,
                  canStatus:
                    canEditTodo ||
                    (!!t.assigneeEmail && t.assigneeEmail === myEmail) ||
                    (!!t.vendorId && myVendorIds.has(t.vendorId)),
                };
              })}
            />
          )}
        </div>
        {(planTasks.length > 0 || todoTasks.length > 0) && (
          <BulkTaskBar
            projectId={project.id}
            statuses={taskStatuses}
            vendors={canAdd ? accountVendors.map((v) => ({ id: v.id, name: v.name })) : undefined}
            logTasks={levelTasks
              .filter(
                (t) =>
                  t.kind !== "phase" &&
                  !isTaskDone(t.status) &&
                  (canAdd ||
                    (!!t.assigneeEmail && t.assigneeEmail === myEmail) ||
                    (!!t.vendorId && myVendorIds.has(t.vendorId))),
              )
              .map((t) => ({
                id: t.id,
                title: t.title,
                percent: t.percentDone,
                due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
              }))}
            defaultRate={(() => {
              const v = levelTasks.find((t) => t.vendorId && myVendorIds.has(t.vendorId))?.vendorId;
              return v ? rateOf(v) : null;
            })()}
          />
        )}
      <TabSection
        title={
          <h2 className="kicker">
            Plán · {taskFilterActive || orderedTasks.length !== planTasks.length ? `${orderedTasks.length} z ${planTasks.length}` : planTasks.length}
            {onlyMine ? " · jen tvoje" : ""}
          </h2>
        }
        actions={
          canAdd && (
            <div className="flex flex-wrap items-center gap-2">
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
        {isManager && sub === null && (
          <div className="mb-4">
            <PlanAi {...await planAiProps(project.id)} />
          </div>
        )}
        {planTasks.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">Zatím žádné naplánované úkoly.</p>
        ) : orderedTasks.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">
            {taskFilterActive ? "Filtru nic neodpovídá." : "Všechny úkoly jsou hotové – zobrazíš je ve Filtru, stav Vše."}
          </p>
        ) : (
          <ul id="task-list" className="group/tasks data-[bulk]:pb-32">
            {orderedTasks.map(({ t, level }) => {
              const isPhase = t.kind === "phase";
              const canEditTask = isManager || t.createdById === user.id;
              const mineTask =
                (!!t.assigneeEmail && t.assigneeEmail === myEmail) ||
                (!!t.vendorId && myVendorIds.has(t.vendorId));
              const canStatusTask = canEditTask || mineTask;
              const kids = isPhase ? taskChildren.get(t.id) ?? [] : [];
              const kidsDone = kids.filter((k) => isTaskDone(k.status)).length;
              const prereqs = (t.dependsOn ?? []).map((d) => d.dependsOn);
              return (
                <TaskRow
                  key={t.id}
                  level={level}
                  todayStart={todayStart}
                  statuses={taskStatuses}
                  canSelect={canStatusTask}
                  canStatus={canStatusTask}
                  canLog={mineTask || canAdd}
                  defaultRate={t.vendorId && myVendorIds.has(t.vendorId) ? rateOf(t.vendorId) : null}
                  t={{
                    id: t.id,
                    title: t.title,
                    kind: t.kind,
                    status: t.status,
                    statusLabel: taskStatusMap.get(t.status) ?? taskStatusLabel(t.status),
                    statusColor: statusColor(t.status),
                    done: isTaskDone(t.status),
                    priority: t.priority,
                    profession: t.profession,
                    dueDate: t.dueDate,
                    estimateDays: t.estimateDays,
                    percentDone: t.percentDone,
                    description: t.description,
                    vendorName: t.vendor?.name ?? null,
                    selfPerformed: t.selfPerformed,
                    assigneeEmail: t.assigneeEmail,
                    createdByName: t.createdBy.name ?? t.createdBy.email ?? "?",
                    prereqs: prereqs.map((p) => ({ title: p.title, done: isTaskDone(p.status) })),
                    phaseKids: isPhase ? { done: kidsDone, total: kids.length } : undefined,
                    phaseWarn:
                      isPhase &&
                      kids.length > 0 &&
                      kidsDone < kids.length &&
                      !!t.startDate &&
                      new Date(t.startDate) <= todayStart,
                  }}
                  extra={
                    canEditTask && (
                      <>
                        {isPhase ? (
                          <CatalogGenerateDialog
                            projectId={project.id}
                            subProjectId={sub ?? undefined}
                            phase={{ id: t.id, title: t.title }}
                          />
                        ) : (
                          <TaskCatalogFillDialog taskId={t.id} taskTitle={t.title} />
                        )}
                        <span className="flex items-center gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          <EditTaskForm
                            task={{
                              id: t.id,
                              title: t.title,
                              assigneeEmail: t.assigneeEmail,
                              startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
                              dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
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
                      </>
                    )
                  }
                />
              );
            })}
          </ul>
        )}
      </TabSection>
        </>
        )}
      </>
      )}
    </div>
  );
}
