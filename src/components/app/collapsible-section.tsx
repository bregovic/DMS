"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Sbalitelná sekce s hlavičkou, která zůstává vždy viditelná (titulek + počet =
 * "sbalený přehled") a tlačítkem pro rozbalení/sbalení těla.
 *
 * Stav rozbalení se pamatuje v localStorage podle `storageKey` — předáním klíče
 * obsahujícího id projektu a subprojektu si tak každý projekt/subprojekt drží
 * vlastní poslední nastavení.
 */
export function CollapsibleSection({
  storageKey,
  title,
  actions,
  defaultOpen = false,
  className,
  children,
}: {
  storageKey: string;
  title: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Po připojení obnovíme zapamatovaný stav pro daný projekt/subprojekt.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "1") setOpen(true);
      else if (saved === "0") setOpen(false);
    } catch {}
  }, [storageKey]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <section className={className}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-stone-300/80 pb-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
        >
          <ChevronDown
            className={`size-4 shrink-0 text-stone-500 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          {title}
        </button>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {open && children}
    </section>
  );
}
