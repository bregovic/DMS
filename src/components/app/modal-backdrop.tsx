"use client";

import { useRef } from "react";

const DEFAULT_BACKDROP =
  "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-0 py-0 sm:p-4 sm:py-12";

/**
 * Pozadí modálního dialogu, které zavře obsah kliknutím mimo — ale jen tehdy,
 * když stisk i uvolnění myši proběhly přímo na pozadí.
 *
 * Tím se řeší případ, kdy uživatel označuje text v poli uvnitř dialogu a tažením
 * vyjede myší ven: `mousedown` začne na obsahu, takže `mouseup` nad pozadím už
 * dialog nezavře (na rozdíl od prostého `onClick`).
 */
export function ModalBackdrop({
  onClose,
  className = DEFAULT_BACKDROP,
  children,
}: {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const downOnBackdrop = useRef(false);
  return (
    <div
      className={className}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}
