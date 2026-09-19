"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { getUnreadCount } from "@/server/actions/notifications";

/** Zvoneček s počtem nepřečtených oznámení – obnoví se při změně stránky a každou minutu. */
export function NotificationBell({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const pathname = usePathname();
  useEffect(() => {
    let live = true;
    const load = () => getUnreadCount().then((n) => live && setCount(n)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pathname]);
  return (
    <Link
      href="/notifikace"
      title={count ? `Oznámení (${count} nových)` : "Oznámení"}
      aria-label={count ? `Oznámení, ${count} nových` : "Oznámení"}
      className="relative flex size-9 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white"
    >
      <Bell className="size-4" />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
