import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { GanttChart, type GanttItem } from "@/components/planning/gantt-chart";
import { TASK_DONE_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const user = await requireUser();
  const email = user.email?.toLowerCase();
  const access = email
    ? { OR: [{ ownerId: user.id }, { memberships: { some: { email } } }] }
    : { ownerId: user.id };

  const projects = await prisma.project.findMany({
    where: access,
    orderBy: { name: "asc" },
    include: {
      tasks: {
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          startDate: true,
          dueDate: true,
          status: true,
          subProject: { select: { name: true } },
        },
      },
    },
  });

  const today = new Date();

  // Projekty, kde je aspoň jeden úkol s termínem (začátek nebo termín).
  const planned = projects
    .map((p) => {
      const items: GanttItem[] = p.tasks
        .filter((t) => t.startDate || t.dueDate)
        .map((t) => ({
          id: t.id,
          name: t.subProject ? `${t.subProject.name}: ${t.title}` : t.title,
          start: t.startDate,
          end: t.dueDate,
          level: 0,
          dependsOnName: null,
          done: TASK_DONE_STATUSES.includes(t.status),
        }))
        .sort((a, b) => {
          const av = (a.start ?? a.end)!.getTime();
          const bv = (b.start ?? b.end)!.getTime();
          return av - bv;
        });
      return { project: p, items };
    })
    .filter((x) => x.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Plánování</h1>
        <p className="mt-2 max-w-xl text-sm text-stone-500">
          Časová osa úkolů podle začátku a termínu. Termíny i stavy se nastavují
          u úkolů v projektu (sekce Úkoly).
        </p>
      </header>

      {planned.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím tu není co plánovat. Přidej úkolům{" "}
          <span className="text-stone-950">začátek nebo termín</span> a objeví se
          tu jejich časová osa.
        </p>
      ) : (
        <div className="space-y-12">
          {planned.map(({ project: p, items }) => (
            <section key={p.id}>
              <div className="mb-4 flex items-baseline justify-between border-b border-stone-300/80 pb-2">
                <h2 className="kicker">
                  {p.name} · {items.length}
                </h2>
                <Link
                  href={`/projects/${p.id}`}
                  className="inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                >
                  Otevřít projekt
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
              <GanttChart items={items} today={today} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
