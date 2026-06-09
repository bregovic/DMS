"use client";

import { useActionState } from "react";
import { changePassword } from "@/server/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="max-w-sm space-y-4">
      {hasPassword && (
        <div className="space-y-1.5">
          <Label htmlFor="current">Stávající heslo</Label>
          <Input id="current" name="current" type="password" required autoComplete="current-password" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="next">Nové heslo</Label>
        <Input id="next" name="next" type="password" required minLength={8} autoComplete="new-password" />
        <p className="text-xs text-stone-400">Alespoň 8 znaků.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Nové heslo znovu</Label>
        <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </div>

      {state?.error && (
        <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Heslo bylo změněno.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Ukládám…" : hasPassword ? "Změnit heslo" : "Nastavit heslo"}
      </Button>
    </form>
  );
}
