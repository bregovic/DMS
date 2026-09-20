"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ModalBackdrop } from "@/components/app/modal-backdrop";

const WIDTH = {
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
} as const;

/**
 * Sdílený dialog (#31).
 *
 * Dřív měl každý formulář vlastní kopii téhož obalu (17×) a lišily se
 * v detailech: žádný neměl role=dialog, Esc fungoval jen někde a hlavně
 * u dlouhých formulářů bylo na mobilu tlačítko Uložit pod okrajem
 * a muselo se k němu rolovat.
 *
 * - na telefonu přes celou obrazovku, na počítači karta uprostřed
 * - hlavička (titulek, ✕) zůstává při rolování nahoře
 * - DialogFooter drží Zrušit / Uložit přilepené dole
 * - Esc zavře, pod dialogem se neroluje stránka
 * - klik mimo zavře jen tehdy, když stisk i puštění myši byly mimo
 *   (tažení při označování textu dialog nezavře) – viz ModalBackdrop
 * - vykresluje se portálem do <body>: dialog otevřený z jiného dialogu tak
 *   leží nad ním celý včetně ztmavení, ne uvnitř jeho obsahu
 */
/**
 * Otevřené dialogy odspodu nahoru. Esc zavírá jen ten nejvrchnější –
 * detail úkolu v sobě otevírá dialog katalogu a Esc by jinak zavřel oba.
 */
const openStack: string[] = [];

export function Dialog({
  title,
  onClose,
  size = "lg",
  actions,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  size?: keyof typeof WIDTH;
  /** Tlačítka v hlavičce vedle ✕ (např. „Z katalogu“ v detailu úkolu). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();
  // portál až po připojení v prohlížeči (na serveru document není)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // onClose bývá nová funkce při každém vykreslení (() => setOpen(false)) –
  // přes ref se posluchač Esc a zámek rolování nastaví jen jednou.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    openStack.push(titleId);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openStack[openStack.length - 1] === titleId) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    // Pod otevřeným dialogem se nemá rolovat stránka (na telefonu by
    // tah prstem posouval obsah za ním).
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      const i = openStack.lastIndexOf(titleId);
      if (i >= 0) openStack.splice(i, 1);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [titleId]);

  if (!mounted) return null;

  return createPortal(
    <ModalBackdrop
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-stone-950/30 sm:p-4 sm:py-12"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex min-h-full w-full flex-col bg-white shadow-lift sm:min-h-0 sm:border sm:border-stone-300 ${WIDTH[size]}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <h3 id={titleId} className="kicker">
            {title}
          </h3>
          <div className="flex items-center gap-3">
            {actions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Zavřít"
              className="-m-2 p-2 text-stone-400 hover:text-stone-950 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

/**
 * Tlačítka dialogu přilepená dole – Uložit je vidět vždy, i u dlouhého
 * formuláře na telefonu. Patří jako poslední prvek do formuláře
 * s odsazením p-5 (záporné okraje ho roztáhnou přes celou šířku).
 */
export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex items-center justify-end gap-2 border-t border-stone-200 bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
