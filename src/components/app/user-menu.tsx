"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { signOutAction } from "@/server/actions/auth";
import { NotificationBell } from "@/components/app/notification-bell";

export function UserMenu({
  name,
  email,
  unread = 0,
}: {
  name?: string | null;
  email?: string | null;
  unread?: number;
}) {
  const initial = (name ?? email ?? "?").charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center border border-stone-950 bg-stone-950 text-sm font-medium text-white">
        {initial}
      </div>
      <div className="hidden sm:block">
        <p className="text-sm font-medium text-stone-950 leading-tight">
          {name ?? "Uživatel"}
        </p>
        <p className="text-xs text-stone-500 leading-tight">{email}</p>
      </div>
      <NotificationBell initial={unread} />
      <Link
        href="/settings"
        title="Nastavení"
        className="flex size-9 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white"
      >
        <Settings className="size-4" />
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          title="Odhlásit se"
          className="flex size-9 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
