"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Přehled" },
  { href: "/projects", label: "Projekty" },
  { href: "/vendors", label: "Dodavatelé" },
  { href: "/katalog", label: "Katalog" },
  { href: "/payments", label: "Platby" },
  { href: "/reports", label: "Reporty" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Nastavení" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Menu"
        className="flex size-9 items-center justify-center text-stone-700 hover:bg-stone-100 cursor-pointer"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/30"
          onClick={() => setOpen(false)}
        >
          <nav
            className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between px-2">
              <span className="display text-2xl text-stone-950">DMS</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-950 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            {links.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "border-l-2 px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "border-stone-950 font-medium text-stone-950"
                      : "border-transparent text-stone-600 hover:text-stone-950",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
