"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Obnovuje serverem vykreslený seznam, dokud něco běží (např. čtení dokladu).
 * Jinak by u položky zůstalo „čtu doklad…“, i když je dávno hotovo.
 */
export function AutoRefresh({ when, ms = 5000 }: { when: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!when) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [when, ms, router]);
  return null;
}
