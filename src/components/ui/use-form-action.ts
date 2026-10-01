"use client";

import { useActionState } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";

/** Hláška u stránky z minulého nasazení – serverová akce, kterou tlačítko
 *  volá, už na serveru není. */
export const STARA_STRANKA =
  "Aplikace se mezitím aktualizovala. Načti stránku znovu.";

export function jeStaraStranka(error?: string | null): boolean {
  return error === STARA_STRANKA;
}

type ErrorState = { error?: string } | undefined;

/** `useActionState`, který nespolkne chybu „Failed to find Server Action".
 *  Bez něj zůstane formulář po nasazení navěky na „Ukládám…". */
export function useFormAction<S extends ErrorState>(
  action: (prev: Awaited<S>, formData: FormData) => Promise<S>,
  initial: Awaited<S>,
) {
  return useActionState<S, FormData>(async (prev, formData) => {
    try {
      return await action(prev, formData);
    } catch (e) {
      if (unstable_isUnrecognizedActionError(e)) {
        return { error: STARA_STRANKA } as Awaited<S>;
      }
      throw e;
    }
  }, initial);
}
