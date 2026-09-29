"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanMailAttachments } from "@/server/actions/doc-scan";

export type MailItem = {
  id: string;
  subject: string;
  from: string;
  attachments: string[];
};

/**
 * Pošta čeká na přečtení. Do jakého projektu doklad patří a jestli je to
 * faktura nebo nabídka, se pozná až ze čtení – tady jen leží.
 */
export function MailQueue({ mails, count }: { mails: MailItem[]; count: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (mails.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="kicker">Z pošty · {mails.length}</h2>
        {count > 0 && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await scanMailAttachments();
                router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            <Mail className="size-4" /> {busy ? "Čtu…" : `Přečíst přílohy (${count})`}
          </Button>
        )}
      </div>
      <ul className="border-t border-stone-200">
        {mails.map((m) => (
          <li key={m.id} className="border-b border-stone-200 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 flex-1 basis-56 truncate text-stone-900" title={m.subject}>
                {m.subject}
              </span>
              <span className="text-xs text-stone-500">{m.from}</span>
            </div>
            {m.attachments.length > 0 && (
              <p className="mt-0.5 text-xs text-stone-400">{m.attachments.join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
