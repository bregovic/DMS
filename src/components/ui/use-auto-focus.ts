"use client";

import { useEffect, useRef } from "react";

/**
 * Fokus na první pole formuláře – ale jen tam, kde pomáhá.
 *
 * Na telefonu by `autoFocus` vytáhl klávesnici dřív, než uživatel vidí, co
 * formulář vlastně chce, a zakryl by přitom půlku dialogu. Proto se na
 * dotykovém zařízení nefokusuje nic a klávesnice vyjede teprve po klepnutí
 * do pole. Na počítači zůstává chování stejné.
 *
 * Fokus se nastavuje až v efektu, ne atributem `autoFocus` – ten by proběhl
 * dřív, než se dá dotykové zařízení poznat.
 */
export function useAutoFocus<T extends HTMLElement>(zapnuto?: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!zapnuto) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    ref.current?.focus();
  }, [zapnuto]);
  return ref;
}
