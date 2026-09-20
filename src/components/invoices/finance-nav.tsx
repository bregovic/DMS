"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/doklady", label: "Doklady" },
  { href: "/faktury", label: "Faktury" },
  { href: "/dph", label: "DPH" },
  { href: "/payments", label: "Platby" },
];

/** Záložky modulu Doklady a fakturace. */
export function FinanceNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-stone-300/80">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors",
              active ? "border-stone-950 font-medium text-stone-950" : "border-transparent text-stone-500 hover:text-stone-950",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
