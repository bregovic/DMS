import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, expandScope } from "@/server/access";
import { GanttChart } from "@/components/planning/gantt-chart";
import { buildProjectGantt } from "@/server/planning";

export const dynamic = "force-dynamic";

export default async function ProjectPlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sub?: string; mine?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const email = user.email?.toLowerCase() ?? "";
  const mine = sp?.mine === "1";

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
        where: { requiredDate: { not: null } },
        orderBy: { requiredDate: "asc" },
        select: {
          id: true,
          title: true,
          requiredDate: true,
          status: true,
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
  });

  const backHref = currentSub
    ? `/projects/${project.id}?sub=${currentSub.id}`
    : `/projects/${project.id}`;
  const planHref = (m: boolean) =>
    `/projects/${project.id}/planning?${subId ? `sub=${subId}&` : ""}${m ? "mine=1" : ""}`;
  const tabClass = (active: boolean) =>
    `border px-3 py-1.5 text-xs transition-colors ${
      active
        ? "border-stone-950 bg-stone-950 text-white"
        : "border-stone-300 text-stone-600 hover:border-stone-950"
    }`;

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
        <div className="flex gap-2">
          <Link href={planHref(false)} className={tabClass(!mine)}>
            Vše
          </Link>
          <Link href={planHref(true)} className={tabClass(mine)}>
            Jen moje
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          {mine
            ? "Žádné tvoje úkoly s termínem."
            : "Zatím tu není co plánovat. Přidej úkolům začátek nebo termín a objeví se tu časová osa."}
        </p>
      ) : (
        <GanttChart items={items} today={today} />
      )}
    </div>
  );
}
