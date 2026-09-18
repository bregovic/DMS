"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Folder, ListChecks, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Přehled", Icon: Home },
  { href: "/projects", label: "Projekty", Icon: Folder },
  // Pro dodavatele je to na telefonu hlavní vstup (#29, #31).
  { href: "/ukoly", label: "Úkoly", Icon: ListChecks },
  { href: "/payments", label: "Platby", Icon: Wallet },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    // pb safe-area: na iPhonu jako nainstalovaná aplikace by lišta ležela
    // pod pruhem pro návrat domů a spodní půlka tlačítek by nešla trefit.
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
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
