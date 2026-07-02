"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  type AuthFormState,
  loginAction,
  registerAction,
} from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Přihlášení přes Google je dočasně vypnuté (zatím nefunguje) – provider zůstává
// v auth.ts, jen se neukazuje v UI.

function ErrorMsg({ state }: { state: AuthFormState }) {
  if (!state?.error) return null;
  return (
    <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
      {state.error}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <div>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Heslo</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <ErrorMsg state={state} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Přihlašuji…" : "Přihlásit se"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-500">
        Nemáš účet?{" "}
        <Link href="/register" className="font-medium text-stone-950 underline underline-offset-4">
          Zaregistruj se
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <div>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Jméno</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Heslo</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="text-xs text-stone-400">Alespoň 8 znaků.</p>
        </div>
        <ErrorMsg state={state} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Vytvářím účet…" : "Vytvořit účet"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-500">
        Už máš účet?{" "}
        <Link href="/login" className="font-medium text-stone-950 underline underline-offset-4">
          Přihlas se
        </Link>
      </p>
    </div>
  );
}
