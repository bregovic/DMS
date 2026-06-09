"use client";

import { QrCode } from "lucide-react";
import { setExpensePaid } from "@/server/actions/expenses";

export function PaymentInfo({
  expenseId,
  projectId,
  paid,
  dueLabel,
  overdue,
  hasBank,
  canManage,
}: {
  expenseId: string;
  projectId: string;
  paid: boolean;
  dueLabel: string | null;
  overdue: boolean;
  hasBank: boolean;
  canManage: boolean;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span
        className={
          paid
            ? "text-emerald-700"
            : overdue
              ? "font-medium text-red-600"
              : "text-stone-500"
        }
      >
        {paid ? "Uhrazeno" : overdue ? "Po splatnosti" : "K úhradě"}
        {!paid && dueLabel ? ` · do ${dueLabel}` : ""}
      </span>

      {!paid && hasBank && (
        <a
          href={`/api/qr/${expenseId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline"
        >
          <QrCode className="size-3" />
          QR platba
        </a>
      )}

      {canManage && (
        <form action={setExpensePaid}>
          <input type="hidden" name="id" value={expenseId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="paid" value={paid ? "false" : "true"} />
          <button
            type="submit"
            className="text-stone-400 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer"
          >
            {paid ? "→ k úhradě" : "→ uhrazeno"}
          </button>
        </form>
      )}
    </div>
  );
}
