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
      <div className="flex size-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
        {initial}
      </div>
      <div className="hidden sm:block">
        <p className="text-sm font-medium text-slate-900 leading-tight">
          {name ?? "Uživatel"}
        </p>
        <p className="text-xs text-slate-500 leading-tight">{email}</p>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          title="Odhlásit se"
          className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
