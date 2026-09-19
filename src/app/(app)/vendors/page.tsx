import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteButton } from "@/components/ui/delete-button";
import { NewVendorForm } from "@/components/vendors/new-vendor-form";
import { EditVendorForm } from "@/components/vendors/edit-vendor-form";
import { VendorAvailabilityDialog } from "@/components/vendors/vendor-availability-dialog";
import { deleteVendor } from "@/server/actions/vendors";
import { TASK_DONE_STATUSES, taskStatusLabel, vendorCategoryLabel } from "@/lib/constants";
import { getStatuses } from "@/server/statuses";
import { GanttChart, type GanttItem } from "@/components/planning/gantt-chart";
import { formatCurrency } from "@/lib/utils";

export default async function VendorsPage() {
  const user = await requireUser();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const since = new Date(todayStart.getTime() - 30 * 86400000);

  const [vendors, totals, vTasks, statuses] = await Promise.all([
    prisma.vendor.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { expenses: true, projects: true } } },
    }),
    prisma.expense.groupBy({
      by: ["vendorId"],
      where: { project: { ownerId: user.id } },
      _sum: { amount: true },
    }),
    // Harmonogram dodavatelů: naplánované úkoly (ne todo) od minulého měsíce dál
    prisma.task.findMany({
      where: {
        vendor: { ownerId: user.id },
        kind: { not: "todo" },
        project: { ownerId: user.id },
        OR: [{ dueDate: { gte: since } }, { dueDate: null, startDate: { gte: since } }],
      },
      orderBy: { startDate: { sort: "asc", nulls: "last" } },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        dueDate: true,
        percentDone: true,
        vendorId: true,
        project: { select: { name: true } },
        subProject: { select: { name: true } },
      },
    }),
    getStatuses("task"),
  ]);

  const statusLabel = new Map(statuses.map((s) => [s.key, s.label]));
  const isDone = (st: string) => TASK_DONE_STATUSES.includes(st);
  const multiProject = new Set(vTasks.map((t) => t.project.name)).size > 1;
  const gantt: GanttItem[] = [];
  for (const v of vendors) {
    const kids = vTasks.filter((t) => t.vendorId === v.id && (t.startDate || t.dueDate));
    if (!kids.length) continue;
    const starts = kids.map((t) => (t.startDate ?? t.dueDate)!.getTime());
    const ends = kids.map((t) => (t.dueDate ?? t.startDate)!.getTime());
    const allDone = kids.every((t) => isDone(t.status));
    gantt.push({
      id: `vendor-${v.id}`,
      name: v.name,
      kind: "phase",
      start: new Date(Math.min(...starts)),
      end: new Date(Math.max(...ends)),
      done: allDone,
      percentDone: Math.round(kids.reduce((a, t) => a + (isDone(t.status) ? 100 : t.percentDone), 0) / kids.length),
      children: kids.map((t) => ({
        id: t.id,
        title: [multiProject ? t.project.name : null, t.subProject?.name, t.title].filter(Boolean).join(" · "),
        start: t.startDate,
        end: t.dueDate,
        done: isDone(t.status),
        percentDone: t.percentDone,
        statusLabel: statusLabel.get(t.status) ?? taskStatusLabel(t.status),
        assigneeEmail: null,
      })),
    });
  }
  gantt.sort((a, b) => a.start!.getTime() - b.start!.getTime());

  const totalByVendor = new Map(
    totals.map((t) => [t.vendorId, Number(t._sum.amount ?? 0)]),
  );

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Dodavatelé</h1>
        <NewVendorForm />
      </header>

      {gantt.length > 0 && (
        <section className="mb-10">
          <h2 className="kicker mb-1">Harmonogram dodavatelů</h2>
          <p className="mb-3 text-xs text-stone-500">
            Kdy má který dodavatel práci – z úkolů ve tvých projektech, od minulého měsíce dál. Termíny se mění v plánování projektu.
          </p>
          <GanttChart items={gantt} today={todayStart} readOnly />
        </section>
      )}

      {vendors.length === 0 ? (
        <EmptyState
          title="Žádní dodavatelé"
          description="Přidej prvního dodavatele tlačítkem výše."
        />
      ) : (
        <ul className="border-t border-stone-300/80">
          {vendors.map((v) => {
            const spent = totalByVendor.get(v.id) ?? 0;
            return (
              <li
                key={v.id}
                className="group flex items-start justify-between gap-4 border-b border-stone-200 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <p className="font-medium text-stone-950">{v.name}</p>
                    <span className="kicker">
                      {vendorCategoryLabel(v.category)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-500">
                    <a
                      href={`mailto:${v.email}`}
                      className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-stone-950 hover:underline"
                    >
                      <Mail className="size-3.5" />
                      {v.email}
                    </a>
                    {v.phone && (
                      <a
                        href={`tel:${v.phone}`}
                        className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-stone-950 hover:underline"
                      >
                        <Phone className="size-3.5" />
                        {v.phone}
                      </a>
                    )}
                    {v.ico && <span>IČO {v.ico}</span>}
                    {v.dic && <span>{v.dic}</span>}
                  </div>
                  {v.address && (
                    <p className="mt-1 text-sm text-stone-400">{v.address}</p>
                  )}
                  {v.description && (
                    <p className="mt-2 max-w-xl text-sm text-stone-500">
                      {v.description}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-start gap-4 text-right">
                  <div>
                    <p className="font-mono text-sm text-stone-950">
                      {formatCurrency(spent)}
                    </p>
                    <p className="kicker mt-0.5">
                      {v._count.expenses > 0 ? (
                        <Link
                          href={`/payments?pvendor=${v.id}`}
                          className="underline-offset-2 hover:text-stone-950 hover:underline"
                          title="Zobrazit platby k úhradě tohoto dodavatele"
                        >
                          {v._count.expenses} výdajů
                        </Link>
                      ) : (
                        `${v._count.expenses} výdajů`
                      )}{" "}
                      · {v._count.projects} proj.
                    </p>
                  </div>
                  <span className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <VendorAvailabilityDialog vendorId={v.id} vendorName={v.name} />
                    <EditVendorForm
                      vendor={{
                        id: v.id,
                        name: v.name,
                        email: v.email,
                        category: v.category,
                        phone: v.phone,
                        description: v.description,
                        ico: v.ico,
                        dic: v.dic,
                        address: v.address,
                        bankAccount: v.bankAccount,
                        hourlyRate: v.hourlyRate != null ? Number(v.hourlyRate) : null,
                      }}
                    />
                    <DeleteButton
                      action={deleteVendor}
                      fields={{ id: v.id }}
                      confirm={`Smazat dodavatele „${v.name}"?`}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
