"use client";

import { useEffect, useState } from "react";

/** Po nasazení se mění identifikátory serverových akcí, takže tlačítka v už
 *  otevřené stránce volají něco, co na serveru není, a formulář zůstane viset
 *  na „Ukládám…". Hlídáme verzi serveru a nabídneme načtení znovu. */
export function VersionWatch({ version }: { version: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (version === "dev") return;
    let stopped = false;

    async function check() {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        if (v && v !== version) setStale(true);
      } catch {
        // offline – zkusí se zas za minutu
      }
    }

    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [version]);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 print:hidden md:bottom-6">
      <div className="flex items-center gap-3 border border-stone-800 bg-stone-950 px-4 py-2.5 text-sm text-white shadow-lift">
        <span>Nová verze aplikace.</span>
        <button
          type="button"
          onClick={() => location.reload()}
          className="cursor-pointer border border-white/40 px-2.5 py-1 transition-colors hover:bg-white hover:text-stone-950"
        >
          Načíst znovu
        </button>
      </div>
    </div>
  );
}
