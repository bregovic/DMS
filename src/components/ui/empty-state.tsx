import type { ReactNode } from "react";

/** Jednotný prázdný stav seznamu/sekce (nadpis + popis + volitelná akce). */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`py-16 text-center ${className ?? ""}`}>
      <p className="display text-xl text-stone-950">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-stone-500">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
