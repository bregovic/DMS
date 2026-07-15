import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { PaymentInfo } from "@/components/expenses/payment-info";
import { setExpensePaid } from "@/server/actions/expenses";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PaymentsPage() {
  const user = await requireUser();

  const expenses = await prisma.expense.findMany({
    // "K úhradě" = vše kromě stavu "uhrazeno" (i bez stavu).
    where: {
      project: { ownerId: user.id },
      OR: [{ stage: null }, { stage: { not: "uhrazeno" } }],
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
        <h1 className="display text-4xl text-stone-950">Platby</h1>
        <div className="text-right">
          <p className="kicker">K úhradě celkem</p>
          <p className="display mt-1 text-2xl text-stone-950">
            {formatCurrency(total)}
          </p>
        </div>
      </header>

      {expenses.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Nic k úhradě. 🎉
        </p>
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
                  paid={e.stage === "uhrazeno"}
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
