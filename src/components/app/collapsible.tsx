"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-stone-300/80 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-stone-50 cursor-pointer"
      >
        <span className="kicker">{title}</span>
        <ChevronDown
          className={`size-4 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-stone-200 p-4">{children}</div>}
    </div>
  );
}
