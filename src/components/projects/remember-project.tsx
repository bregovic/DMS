"use client";

import { useEffect } from "react";

import { LAST_PROJECT_COOKIE } from "./project-tabs";

/**
 * Zapamatuje si otevřený projekt, složku a záložku.
 *
 * Aplikace se po spuštění (i jako nainstalovaná na telefonu) otevírá na `/`
 * a odtud rovnou sem – člověk pokračuje tam, kde skončil, místo aby se
 * pokaždé proklikával z přehledu.
 *
 * Ukládají se jen ID, ne adresa: adresu skládá server a přístup k projektu
 * znovu ověří. Podstrčená hodnota tak nikam jinam nepřesměruje.
 */
export function RememberProject({
  projectId,
  sub,
  tab,
}: {
  projectId: string;
  sub: string | null;
  tab: string;
}) {
  useEffect(() => {
    const value = encodeURIComponent([projectId, sub ?? "", tab].join("|"));
    document.cookie = `${LAST_PROJECT_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [projectId, sub, tab]);
  return null;
}
