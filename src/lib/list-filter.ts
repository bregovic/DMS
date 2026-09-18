/**
 * Standard filtrování seznamů (výdaje, úkoly, žádanky, platby, katalog).
 *
 * Každý seznam má nad sebou jednu lištu `ListFilters` s prefixem
 * parametrů v adrese (e = výdaje, t = úkoly, r = žádanky, p = platby…):
 *   <prefix>q      hledání v názvu
 *   <prefix>from   datum od (YYYY-MM-DD)
 *   <prefix>to     datum do
 *   <prefix>st     stavy, víc najednou: "todo,in_progress"; "all" = všechny;
 *                  bez parametru platí výchozí výběr seznamu (typicky neukončené)
 *   <prefix>sort   pole řazení, <prefix>dir = asc | desc
 *   <prefix><key>  další rozbalovací filtry (dodavatel…)
 *
 * Lišta je výchozí sbalená – vidět je tlačítko Filtr (s počtem aktivních
 * filtrů) a řazení. Serverová stránka čte parametry přes pomocníky níže.
 */

export const ALL_STATUSES = "all";

/**
 * Vybrané stavy z adresy. null = bez omezení (všechny).
 * Bez parametru vrátí výchozí výběr (`defaults`), prázdný = všechny.
 */
export function parseStatusFilter(raw: unknown, defaults: string[] = []): Set<string> | null {
  if (typeof raw !== "string") return defaults.length ? new Set(defaults) : null;
  if (raw === ALL_STATUSES || raw === "") return null;
  return new Set(raw.split(",").filter(Boolean));
}

/** Je výběr stavů jiný než výchozí? (pro „filtr aktivní“) */
export function statusFilterIsCustom(raw: unknown): boolean {
  return typeof raw === "string";
}
