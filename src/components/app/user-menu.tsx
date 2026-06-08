"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/server/actions/auth";

export function UserMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
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
      <form action={signOutAction}>
        <button
          type="submit"
          title="Odhlásit se"
          className="ml-1 flex size-9 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
