/**
 * Sekce formuláře – jemné rozdělení dlouhých formulářů do logických celků
 * (nadpis, volitelné vysvětlení, oddělovací linka). Bez rámečků, ať dialog
 * zůstane klidný; na mobilu se pole skládají pod sebe.
 */
export function FormSection({
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 border-t border-stone-200 pt-4 first:border-t-0 first:pt-0 ${className}`}>
      {(title || actions) && (
        <div className="flex items-baseline justify-between gap-3">
          <div>
            {title && <h3 className="kicker">{title}</h3>}
            {hint && <p className="mt-0.5 text-[11px] text-stone-400">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Mřížka polí: na mobilu jeden sloupec, na počítači 2 (nebo 3). */
export function FormGrid({ cols = 2, children }: { cols?: 2 | 3; children: React.ReactNode }) {
  return (
    <div className={`grid grid-cols-1 items-end gap-x-4 gap-y-3 ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {children}
    </div>
  );
}

/** Jedno pole s popiskem (a volitelnou nápovědou pod ním). */
export function Field({
  label,
  htmlFor,
  hint,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="kicker block !text-stone-500">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-stone-400">{hint}</p>}
    </div>
  );
}
