"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Folder, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Přehled", Icon: Home },
  { href: "/projects", label: "Projekty", Icon: Folder },
  { href: "/payments", label: "Platby", Icon: Wallet },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-200 bg-white/95 backdrop-blur md:hidden">
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
              active ? "text-stone-950" : "text-stone-400 hover:text-stone-700",
            )}
          >
            <Icon className={cn("size-5", active && "text-stone-950")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
