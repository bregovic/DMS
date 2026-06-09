import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { GanttChart, type GanttItem } from "@/components/planning/gantt-chart";

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
      subProjects: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          parentId: true,
          startDate: true,
          deadline: true,
          dependsOnId: true,
        },
      },
    },
  });

  const today = new Date();

  // Připrav data pro každý projekt, kde je aspoň jeden subprojekt s termínem.
  const planned = projects
    .map((p) => {
      const byId = new Map(p.subProjects.map((s) => [s.id, s]));
      const depth = (sid: string) => {
        let d = 0;
        let cur = byId.get(sid);
        while (cur?.parentId) {
          d++;
          cur = byId.get(cur.parentId);
        }
        return d;
      };
      const items: GanttItem[] = p.subProjects
        .filter((s) => s.startDate || s.deadline)
        .map((s) => ({
          id: s.id,
          name: s.name,
          start: s.startDate,
          end: s.deadline,
          level: depth(s.id),
          dependsOnName: s.dependsOnId
            ? byId.get(s.dependsOnId)?.name ?? null
            : null,
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
          Časová osa subprojektů podle začátku a termínu. Termín u subprojektu
          (a začátek / návaznost) nastavíš tužkou přímo u složky v projektu.
        </p>
      </header>

      {planned.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Zatím tu není co plánovat. Přidej subprojektům{" "}
          <span className="text-stone-950">začátek a termín</span> a objeví se
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
