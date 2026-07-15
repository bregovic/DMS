import { QrCode } from "lucide-react";

export function PaymentInfo({
  expenseId,
  paid,
  dueLabel,
  overdue,
  hasBank,
}: {
  expenseId: string;
  paid: boolean;
  dueLabel: string | null;
  overdue: boolean;
  hasBank: boolean;
}) {
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
    </div>
  );
}
