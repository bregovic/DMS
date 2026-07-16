import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { PaymentInfo } from "@/components/expenses/payment-info";
import { setExpensePaid } from "@/server/actions/expenses";
import { EXPENSE_PAID_STAGE, isExpensePaid } from "@/lib/constants";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const user = await requireUser();
  const vendorId = (await searchParams)?.vendor || null;
  const filterVendor = vendorId
    ? await prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } })
    : null;

  const expenses = await prisma.expense.findMany({
    // "K úhradě" = vše kromě stavu "uhrazeno" (i bez stavu).
    where: {
      project: { ownerId: user.id },
      ...(vendorId ? { vendorId } : {}),
      OR: [{ stage: null }, { stage: { not: EXPENSE_PAID_STAGE } }],
    },
    include: {
      project: { select: { id: true, name: true } },
      vendor: { select: { name: true, bankAccount: true } },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { date: "asc" }],
  });

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">Platby</h1>
          {filterVendor && (
            <p className="kicker mt-1">
              Dodavatel: {filterVendor.name} ·{" "}
              <Link href="/payments" className="underline-offset-2 hover:text-stone-950 hover:underline">
                zrušit filtr
              </Link>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="kicker">K úhradě celkem</p>
          <p className="display mt-1 text-2xl text-stone-950">
            {formatCurrency(total)}
          </p>
        </div>
      </header>

      {expenses.length === 0 ? (
        <EmptyState
          title="Nic k úhradě"
          description="Všechny výdaje jsou uhrazené."
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
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm text-stone-950">
                  {formatCurrency(Number(e.amount), e.currency)}
                </span>
                <form action={setExpensePaid}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="projectId" value={e.project.id} />
                  <input type="hidden" name="paid" value="true" />
                  <button
                    type="submit"
                    className="whitespace-nowrap border border-stone-300 px-2 py-1 text-[11px] text-stone-600 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white cursor-pointer"
                  >
                    Uhrazeno
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
