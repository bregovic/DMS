import { unstable_isUnrecognizedActionError } from "next/navigation";

/** Hláška u stránky z minulého nasazení – serverová akce, kterou tlačítko
 *  volá, už na serveru není. */
export const STARA_STRANKA =
  "Aplikace se mezitím aktualizovala. Načti stránku znovu.";

/** Text chyby pro uživatele. Místo „Server Action … was not found" po nasazení
 *  řekne, že stačí načíst stránku znovu. */
export function chybaAkce(e: unknown, fallback: string): string {
  if (unstable_isUnrecognizedActionError(e)) return STARA_STRANKA;
  return e instanceof Error ? e.message : fallback;
}
