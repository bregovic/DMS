import { unstable_isUnrecognizedActionError } from "next/navigation";
import { isGenericServerError, userMessage } from "@/lib/user-error";

/** Hláška u stránky z minulého nasazení – serverová akce, kterou tlačítko
 *  volá, už na serveru není. */
export const STARA_STRANKA =
  "Aplikace se mezitím aktualizovala. Načti stránku znovu.";

/** Text chyby pro uživatele. Místo „Server Action … was not found" po nasazení
 *  řekne, že stačí načíst stránku znovu. */
export function chybaAkce(e: unknown, fallback: string): string {
  if (unstable_isUnrecognizedActionError(e)) return STARA_STRANKA;
  const msg = userMessage(e);
  if (msg) return msg;
  if (e instanceof Error && e.message && !isGenericServerError(e.message)) return e.message;
  return fallback;
}
