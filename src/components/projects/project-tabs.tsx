import Link from "next/link";

export const PROJECT_TABS = ["vydaje", "ukoly", "zadanky", "prijmy", "dokumenty"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];
export const DEFAULT_PROJECT_TAB: ProjectTab = "vydaje";

/**
 * Cookie s naposledy otevřeným projektem – zapisuje RememberProject, čte
 * vstupní stránka `/`. Tady, ne v klientské komponentě: konstanta
 * exportovaná ze souboru s "use client" by na serveru nebyla řetězec.
 */
export const LAST_PROJECT_COOKIE = "dms-last";

export function parseProjectTab(value: unknown): ProjectTab {
  return typeof value === "string" && (PROJECT_TABS as readonly string[]).includes(value)
    ? (value as ProjectTab)
    : DEFAULT_PROJECT_TAB;
}

/**
 * Adresa projektu/složky se záložkou.
 *
 * Výchozí záložka se do adresy nepíše, ať odkazy zůstanou krátké a staré
 * odkazy (bez `tab`) vedou tam, kam vedly dřív.
 */
export function projectHref(projectId: string, sub: string | null, tab: ProjectTab) {
  const params = new URLSearchParams();
  if (sub) params.set("sub", sub);
  if (tab !== DEFAULT_PROJECT_TAB) params.set("tab", tab);
  const q = params.toString();
  return `/projects/${projectId}${q ? `?${q}` : ""}`;
}

/**
 * Záložky Výdaje / Úkoly / Žádanky / Příjmy / Dokumenty.
 *
 * Detail projektu byl jedna dlouhá stránka, kde se na mobilu rolovalo přes
 * výdaje k úkolům. Každá sekce má teď vlastní adresu, takže jde otevřít
 * rovnou a odkaz na ni poslat. Na úzkém displeji se lišta posouvá do strany.
 */
export function ProjectTabs({
  projectId,
  sub,
  active,
  tabs,
}: {
  projectId: string;
  sub: string | null;
  active: ProjectTab;
  tabs: { key: ProjectTab; label: string; count?: number }[];
}) {
  return (
    <nav
      aria-label="Sekce projektu"
      className="-mx-4 mt-8 overflow-x-auto border-b border-stone-300/80 px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={projectHref(projectId, sub, t.key)}
                aria-current={on ? "page" : undefined}
                scroll={false}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${
                  on
                    ? "border-stone-950 font-medium text-stone-950"
                    : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-950"
                }`}
              >
                {t.label}
                {t.count != null && (
                  <span
                    className={`min-w-5 px-1.5 py-px text-center text-[11px] tabular-nums ${
                      on ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Obsah jedné záložky: titulek s počtem vlevo, akce (Přidat…) vpravo. */
export function TabSection({
  title,
  actions,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {title}
        {actions}
      </div>
      {children}
    </section>
  );
}
