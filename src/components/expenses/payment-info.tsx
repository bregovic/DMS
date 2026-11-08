"use client";

import { useMemo, useState } from "react";
import { QrCode } from "lucide-react";
import { QrAggregateModal } from "@/components/expenses/qr-aggregate-modal";

export function PaymentInfo({
  expenseId,
  projectId = "",
  paid,
  dueLabel,
  overdue,
  hasBank,
}: {
  expenseId: string;
  /** prázdné = seznam napříč projekty (modul Platby) */
  projectId?: string;
  paid: boolean;
  dueLabel: string | null;
  overdue: boolean;
  hasBank: boolean;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  // stálé pole – dialog podle něj znovu načítá QR
  const ids = useMemo(() => [expenseId], [expenseId]);

  // Stav úhrady řeší lookup stav výdaje – tady jen splatnost + QR (bez duplicity).
  if (paid) return null;
  if (!dueLabel && !hasBank) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {dueLabel && (
        <span className={overdue ? "font-medium text-red-600" : "text-stone-500"}>
          {overdue ? "Po splatnosti" : "Splatnost"} · {dueLabel}
        </span>
      )}

      {hasBank && (
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1 text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline"
        >
          <QrCode className="size-3" />
          QR platba
        </button>
      )}

      {qrOpen && (
        <QrAggregateModal projectId={projectId} ids={ids} onClose={() => setQrOpen(false)} />
      )}
    </div>
  );
}
