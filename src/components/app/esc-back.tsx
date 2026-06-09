"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ESC = o úroveň výš (ven ze subprojektu). Ignoruje psaní v poli a otevřený modal.
export function EscBack({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      // otevřený modal (overlay) má přednost – ESC nech na něj
      if (document.querySelector("div.fixed.inset-0.z-50")) return;
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [href, router]);
  return null;
}
