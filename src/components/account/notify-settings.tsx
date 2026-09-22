"use client";

import { useState } from "react";
import { saveNotifySettings } from "@/server/actions/inbound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Oznámení e-mailem (#41). Co chodí do zvonečku (přidělený úkol, výdaj od
 * ostatních, připomínky, žádost o úhradu), může chodit i na e-mail.
 */
export function NotifySettings({
  enabled,
  address,
  loginEmail,
  configured,
}: {
  enabled: boolean;
  address: string | null;
  loginEmail: string | null;
  configured: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        setErr(null);
        try {
          await saveNotifySettings(fd);
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Uložení selhalo.");
        }
      }}
      className="max-w-sm space-y-3"
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
        <input
          type="checkbox"
          name="notifyByEmail"
          value="1"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="size-4 cursor-pointer accent-stone-900"
        />
        Posílat oznámení i e-mailem
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="notifyEmail">Adresa pro oznámení</Label>
        <Input
          id="notifyEmail"
          name="notifyEmail"
          type="email"
          defaultValue={address ?? ""}
          placeholder={loginEmail ?? "muj@email.cz"}
          disabled={!on}
        />
        <p className="text-xs text-stone-400">
          Prázdné: {loginEmail ?? "přihlašovací e-mail"}
        </p>
      </div>

      {!configured && (
        <p className="border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Odesílání e-mailů není nastavené.
        </p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit">Uložit</Button>
        {saved && <span className="text-xs text-emerald-700">Uloženo.</span>}
      </div>
    </form>
  );
}
