"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import {
  type AuthFormState,
  googleSignInAction,
  loginAction,
  registerAction,
} from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function GoogleButton() {
  return (
    <form action={googleSignInAction}>
      <Button type="submit" variant="outline" className="w-full">
        <Mail className="size-4" />
        Pokračovat přes Google
      </Button>
    </form>
  );
}

function Divider() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-white px-2 text-slate-400">nebo</span>
      </div>
    </div>
  );
}

function ErrorMsg({ state }: { state: AuthFormState }) {
  if (!state?.error) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
      {state.error}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <div className="space-y-4">
      <GoogleButton />
      <Divider />
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
      <p className="text-center text-sm text-slate-500">
        Nemáš účet?{" "}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline">
          Zaregistruj se
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <div className="space-y-4">
      <GoogleButton />
      <Divider />
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
          <p className="text-xs text-slate-400">Alespoň 8 znaků.</p>
        </div>
        <ErrorMsg state={state} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Vytvářím účet…" : "Vytvořit účet"}
        </Button>
      </form>
      <p className="text-center text-sm text-slate-500">
        Už máš účet?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Přihlas se
        </Link>
      </p>
    </div>
  );
}
