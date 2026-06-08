import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { formatCurrency } from "@/lib/utils";
import { projectTypeLabel } from "@/lib/constants";

export default async function ProjectsPage() {
  const user = await requireUser();

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    include: {
      _count: { select: { expenses: true, documents: true } },
      expenses: { select: { amount: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Projekty</h1>
          <p className="text-slate-500">Dům, auto, garáž… vše přehledně</p>
        </div>
      </div>

      <NewProjectForm />

      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-slate-500">
            Zatím tu nic není. Vytvoř svůj první projekt tlačítkem výše.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const t = projectTypeLabel(p.type);
            const total = p.expenses.reduce(
              (sum, e) => sum + Number(e.amount),
              0,
            );
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center gap-3">
                      <span
                        className="flex size-10 items-center justify-center rounded-lg text-xl"
                        style={{ backgroundColor: `${p.color}1a` }}
                      >
                        {t.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-500">{t.label}</p>
                      </div>
                    </div>
                    {p.description && (
                      <p className="mb-3 line-clamp-2 text-sm text-slate-500">
                        {p.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-xs text-slate-500">
                        {p._count.expenses} výdajů · {p._count.documents} dok.
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
