"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanInbox } from "@/server/actions/doc-scan";

/** E-mail se vším, co přišlo v jedné zprávě – drží se pohromadě. */
export type InboxMail = { id: string; subject: string; from: string; files: string[] };
/** Nahraný soubor, který ještě nikdo nečetl. */
export type InboxFile = { id: string; name: string; place: string | null; by: string | null };

/**
 * Nezpracované doklady: co přišlo poštou i co se nahrálo ručně, než se
 * přečte. Kam doklad patří a jestli je to faktura nebo nabídka, se pozná
 * až ze čtení.
 */
export function InboxQueue({
  mails,
  files,
  children,
}: {
  mails: InboxMail[];
  files: InboxFile[];
  /** Řádky nahraných souborů s vlastními tlačítky (náhled, smazat, přečíst). */
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const pocet = mails.reduce((a, m) => a + m.files.length, 0) + files.length;
  if (pocet === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="kicker">Nezpracované · {pocet}</h2>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await scanInbox();
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <FileStack className="size-4" /> {busy ? "Čtu…" : `Přečíst vše (${pocet})`}
        </Button>
      </div>
      <ul className="border-t border-stone-200">
        {mails.map((m) => (
          <li key={m.id} className="border-b border-stone-200 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 flex-1 basis-56 truncate text-stone-900" title={m.subject}>
                {m.subject}
              </span>
              <span className="text-xs text-stone-500">{m.from}</span>
              <span className="text-xs text-stone-400">{m.files.length} příloh</span>
            </div>
            {m.files.length > 0 && <p className="mt-0.5 text-xs text-stone-400">{m.files.join(" · ")}</p>}
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}
