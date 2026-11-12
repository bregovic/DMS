"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Zkopíruje text (nebo adresu stránky) do schránky. */
export function CopyButton({
  text,
  label = "Kopírovat",
  useLocation = false,
  className,
}: {
  text: string;
  label?: string;
  useLocation?: boolean;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    const value = useLocation ? window.location.href.split("?")[0] : text;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ??
        "inline-flex items-center gap-1.5 border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950 cursor-pointer"
      }
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Zkopírováno" : label}
    </button>
  );
}
