import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { PaymentInfo } from "@/components/expenses/payment-info";
import { ExpenseStageSelect } from "@/components/expenses/expense-stage-select";
import { setExpensePaid } from "@/server/actions/expenses";
import { getStatuses } from "@/server/statuses";
import { EXPENSE_PAID_STAGE, EXPENSE_STATUSES, isExpensePaid } from "@/lib/constants";
import { ListFilters } from "@/components/ui/list-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  const vendorId = str(sp.pvendor);
  const status = str(sp.pstatus); // "" = neuhrazené (default) | __all__ | stage
  const q = str(sp.pq).trim();
  const from = str(sp.pfrom);
  const to = str(sp.pto);
  const sort = str(sp.psort) || "due";
  const dir = str(sp.pdir) === "asc" ? "asc" : "desc";

  const [vendors, expenseStatuses] = await Promise.all([
    prisma.vendor.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getStatuses("expense"),
  ]);

  // Filtr stavu: prázdné = vše kromě "uhrazeno" (i bez stavu); __all__ = vše.
  const stageWhere: Prisma.ExpenseWhereInput =
    status === "__all__"
      ? {}
      : status
        ? { stage: status }
        : { OR: [{ stage: null }, { stage: { not: EXPENSE_PAID_STAGE } }] };

  const where: Prisma.ExpenseWhereInput = {
    project: { ownerId: user.id },
    ...(vendorId ? { vendorId } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
          },
        }
      : {}),
    ...stageWhere,
  };

  const orderBy: Prisma.ExpenseOrderByWithRelationInput[] =
    sort === "amount"
      ? [{ amount: dir }]
      : sort === "date"
        ? [{ date: dir }]
        : [{ dueDate: { sort: dir, nulls: "last" } }, { date: "asc" }];

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
      vendor: { select: { name: true, bankAccount: true } },
    },
    orderBy,
  });

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const unpaidTotal = expenses
    // příjem (záporná částka) není co proplácet
    .filter((e) => !isExpensePaid(e.stage) && Number(e.amount) > 0)
    .reduce((s, e) => s + Number(e.amount), 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const statusFilterActive = Boolean(vendorId || status || q || from || to);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">Platby</h1>
          <p className="kicker mt-1">
            {expenses.length} položek
            {statusFilterActive ? " (filtrováno)" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="kicker">Součet zobrazených</p>
          <p className="display mt-1 text-2xl text-stone-950">
            {formatCurrency(total)}
          </p>
          {unpaidTotal !== total && (
            <p className="mt-0.5 text-xs text-stone-500">
              z toho neuhrazeno {formatCurrency(unpaidTotal)}
            </p>
          )}
        </div>
      </header>

      <ListFilters
        prefix="p"
        placeholder="Hledat v názvu…"
        sortOptions={[
          { value: "due", label: "Termín úhrady" },
          { value: "date", label: "Datum" },
          { value: "amount", label: "Částka" },
        ]}
        selects={[
          {
            key: "vendor",
            label: "Dodavatel",
            options: vendors.map((v) => ({ value: v.id, label: v.name })),
          },
          {
            key: "status",
            label: "Neuhrazené",
            options: [
              { value: "__all__", label: "Vše (i uhrazené)" },
              ...EXPENSE_STATUSES.map((s) => ({ value: s.value, label: s.label })),
            ],
          },
        ]}
      />

      {expenses.length === 0 ? (
        <EmptyState
          title="Nic k zobrazení"
          description={
            statusFilterActive
              ? "Zkus upravit filtr."
              : "Všechny výdaje jsou uhrazené."
          }
        />
      ) : (
        <ul className="border-t border-stone-300/80">
          {expenses.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline justify-between gap-3 border-b border-stone-200 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-950">
                  {e.title}
                </p>
                <p className="kicker mt-0.5">
                  <Link
                    href={`/projects/${e.project.id}`}
                    className="underline-offset-2 hover:text-stone-950 hover:underline"
                  >
                    {e.project.name}
                  </Link>
                  {e.vendor ? ` · ${e.vendor.name}` : ""} · {formatDate(e.date)}
                </p>
                <PaymentInfo
                  expenseId={e.id}
                  paid={isExpensePaid(e.stage)}
                  dueLabel={e.dueDate ? formatDate(e.dueDate) : null}
                  overdue={!!e.dueDate && new Date(e.dueDate) < todayStart}
                  hasBank={Boolean(e.vendor?.bankAccount)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-sm text-stone-950">
                  {formatCurrency(Number(e.amount), e.currency)}
                </span>
                <ExpenseStageSelect
                  projectId={e.project.id}
                  id={e.id}
                  stage={e.stage}
                  statuses={expenseStatuses}
                />
                {!isExpensePaid(e.stage) && (
                  <form action={setExpensePaid}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="projectId" value={e.project.id} />
                    <input type="hidden" name="paid" value="true" />
                    <button
                      type="submit"
                      title="Rychlé označení jako uhrazeno"
                      className="whitespace-nowrap border border-stone-300 px-2 py-1 text-[11px] text-stone-600 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white cursor-pointer"
                    >
                      Uhrazeno
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
