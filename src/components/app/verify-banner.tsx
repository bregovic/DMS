"use client";

import { useState, useTransition } from "react";
import { resendVerification } from "@/server/actions/auth";

/** Lišta pro neověřený e-mail – sdílené přístupy se zapnou až po ověření. */
export function VerifyBanner({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-8">
      Ověř e-mail odkazem, který přišel na {email}. Do té doby nejsou vidět projekty sdílené na tento e-mail.{" "}
      {msg ? (
        <span className="font-medium">{msg}</span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                const r = await resendVerification();
                setMsg(r.ok ? "Odkaz odeslán." : (r.error ?? "Nepovedlo se."));
              } catch {
                setMsg("Nepovedlo se. Načti stránku znovu.");
              }
            })
          }
          className="cursor-pointer font-medium underline underline-offset-2 disabled:opacity-50"
        >
          Poslat odkaz znovu
        </button>
      )}
    </div>
  );
}
