import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, expandScope } from "@/server/access";
import { GanttChart } from "@/components/planning/gantt-chart";
import { buildProjectGantt } from "@/server/planning";
import { recomputeSchedule } from "@/server/actions/tasks";

export const dynamic = "force-dynamic";

export default async function ProjectPlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    sub?: string; mine?: string; f?: string; vr?: string; from?: string; to?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const email = user.email?.toLowerCase() ?? "";
  const mine = sp?.mine === "1";
  const statusF = (["open", "done", "overdue"] as const).find((x) => x === sp?.f) ?? "all";
  const onlyVR = sp?.vr === "1";
  const fromD = sp?.from ? new Date(sp.from) : null;
  const toD = sp?.to ? new Date(sp.to) : null;
  if (toD) toD.setHours(23, 59, 59, 999);

  const access = await getProjectAccess(id, user);
  if (!access) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      subProjects: { select: { id: true, parentId: true, name: true } },
      tasks: {
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          startDate: true,
          dueDate: true,
          status: true,
          createdById: true,
          assigneeEmail: true,
          subProjectId: true,
          parentId: true,
          kind: true,
          percentDone: true,
          subProject: { select: { name: true } },
          dependsOn: {
            select: { dependsOn: { select: { id: true, title: true, status: true } } },
          },
          requests: { select: { status: true, leadDays: true, requiredDate: true } },
        },
      },
      requests: {
        where: { OR: [{ requiredDate: { not: null } }, { startDate: { not: null } }] },
        orderBy: { requiredDate: "asc" },
        select: {
          id: true,
          title: true,
          startDate: true,
          requiredDate: true,
          status: true,
          taskId: true,
          createdById: true,
          subProjectId: true,
          subProject: { select: { name: true } },
        },
      },
    },
  });
  if (!project) notFound();

  // subtree(sub): složka + všechny její pod-složky
  const childrenOf = new Map<string, string[]>();
  for (const s of project.subProjects)
    if (s.parentId) {
      const a = childrenOf.get(s.parentId) ?? [];
      a.push(s.id);
      childrenOf.set(s.parentId, a);
    }
  const subtree = (root: string) => {
    const out = new Set<string>();
    const stack = [root];
    while (stack.length) {
      const x = stack.pop()!;
      if (out.has(x)) continue;
      out.add(x);
      (childrenOf.get(x) ?? []).forEach((c) => stack.push(c));
    }
    return out;
  };

  const subId =
    sp?.sub && project.subProjects.some((s) => s.id === sp.sub) ? sp.sub : null;
  const currentSub = subId
    ? project.subProjects.find((s) => s.id === subId) ?? null
    : null;

  // rozsah přístupu: null = celý projekt, jinak povolené složky + pod-složky
  const accessScope = access.scopeSubIds
    ? await expandScope(id, access.scopeSubIds)
    : null;

  // výsledný scope pro Gantt
  let scope: Set<string> | null = accessScope;
  if (subId) {
    const tree = subtree(subId);
    if (accessScope && !accessScope.has(subId)) notFound(); // do této složky nemá přístup
    scope = accessScope ? new Set([...tree].filter((x) => accessScope.has(x))) : tree;
  }

  const today = new Date();
  const items = buildProjectGantt(project.tasks, project.requests, {
    scope,
    userId: user.id,
    email,
    mine,
    withSubprojectName: false, // v rámci projektu název složky neopakujeme
    strictScope: true,
    filter: { status: statusF, onlyRequests: onlyVR, from: fromD, to: toD },
  });

  const backHref = currentSub
    ? `/projects/${project.id}?sub=${currentSub.id}`
    : `/projects/${project.id}`;
  const anyFilter = mine || onlyVR || statusF !== "all" || !!sp?.from || !!sp?.to;
  const selectClass =
    "h-8 rounded-none border border-stone-300 bg-white px-2 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950";

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        {currentSub ? currentSub.name : project.name}
      </Link>

      <header className="mt-6 mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <p className="kicker">{currentSub ? `${project.name} · ${currentSub.name}` : project.name}</p>
          <h1 className="display mt-1 text-4xl text-stone-950">Plánování</h1>
          <p className="mt-2 max-w-xl text-sm text-stone-500">
            Časová osa fází a úkolů. Klikni na fázi pro rozpad na dílčí úkoly.
            Termíny a stavy se nastavují u úkolů.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(access.role === "owner" || access.role === "active") && (
            <form action={recomputeSchedule}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="subProjectId" value={subId ?? ""} />
              <button
                type="submit"
                className="border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
                title="Přepočítat termíny z návazností a délek úkolů (hotové úkoly drží data)"
              >
                ⟳ Přepočítat termíny
              </button>
            </form>
          )}
        </div>
      </header>

      {/* Filtry */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-x-3 gap-y-2">
        {subId && <input type="hidden" name="sub" value={subId} />}
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400">
          Stav
          <select name="f" defaultValue={statusF} className={selectClass}>
            <option value="all">Vše</option>
            <option value="open">Otevřené</option>
            <option value="done">Hotové</option>
            <option value="overdue">Po termínu</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400">
          Od
          <input type="date" name="from" defaultValue={sp?.from ?? ""} className={selectClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-stone-400">
          Do
          <input type="date" name="to" defaultValue={sp?.to ?? ""} className={selectClass} />
        </label>
        <label className="flex h-8 items-center gap-1.5 text-xs text-stone-600">
          <input type="checkbox" name="vr" value="1" defaultChecked={onlyVR} className="size-4 accent-stone-900" />
          Pouze VŘ
        </label>
        <label className="flex h-8 items-center gap-1.5 text-xs text-stone-600">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="size-4 accent-stone-900" />
          Jen moje
        </label>
        <button
          type="submit"
          className="h-8 border border-stone-950 bg-stone-950 px-3 text-xs text-white transition-colors hover:bg-stone-800"
        >
          Filtrovat
        </button>
        {anyFilter && (
          <Link
            href={`/projects/${project.id}/planning${subId ? `?sub=${subId}` : ""}`}
            className="h-8 border border-stone-300 px-3 text-xs leading-8 text-stone-600 transition-colors hover:border-stone-950"
          >
            Zrušit filtr
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          {anyFilter
            ? "Filtru nic neodpovídá. Zkus ho zmírnit nebo zrušit."
            : "Zatím tu není co plánovat. Přidej úkolům začátek nebo termín a objeví se tu časová osa."}
        </p>
      ) : (
        <GanttChart items={items} today={today} />
      )}
    </div>
  );
}
