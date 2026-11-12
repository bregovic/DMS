/**
 * Hláška pro uživatele ze serverového kódu.
 *
 * Next v produkci chybu vyhozenou ze serverové akce klientovi nepošle – místo
 * „Zadej, co se poptává.“ přijde anglické „An error occurred in the Server
 * Components render…“. Vlastní `digest` ale respektuje a ten do prohlížeče
 * dorazí. Text hlášky proto jede v digestu s předponou.
 */
const PREFIX = "DMS:";

export class UserError extends Error {
  digest: string;
  constructor(message: string) {
    super(message);
    this.name = "UserError";
    this.digest = PREFIX + message;
  }
}

/** Hláška z chyby serverové akce, nebo null, když nejde o UserError. */
export function userMessage(e: unknown): string | null {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && d.startsWith(PREFIX) ? d.slice(PREFIX.length) : null;
}

/** Obecná produkční hláška Next – nic neříká, nezobrazovat. */
export function isGenericServerError(message: string | undefined | null) {
  return !!message && /An error occurred in the Server Components render|omitted in production/i.test(message);
}
