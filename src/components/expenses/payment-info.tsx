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
  // Informativní stav úhrady (mění se přes stav výdaje / úpravu). Bez přepínače.
  if (paid && !dueLabel) return null;
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
    </div>
  );
}
