"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Přehled" },
  { href: "/projects", label: "Projekty" },
  { href: "/vendors", label: "Dodavatelé" },
  { href: "/reports", label: "Reporty" },
  { href: "/import", label: "Import" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col">
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-stone-950 font-medium text-stone-950"
                : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-950",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors",
                active ? "bg-stone-950" : "bg-stone-300 group-hover:bg-stone-500",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
