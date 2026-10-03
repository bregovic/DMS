"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { ReceiptScan } from "@/components/expenses/receipt-scan";

/**
 * Nahrání dokladu v projektu. Doklad se po nahrání sám přečte a dál se
 * s ním pracuje v modulu Doklady – tady zůstane jen potvrzení, které
 * za chvíli zmizí, ať v projektu nevisí druhá fronta.
 */
export function DocInbox({
  projectId,
  projectName,
  subProjectId,
  subProjects,
}: {
  projectId: string;
  projectName: string;
  /** Otevřená složka projektu – doklad se zařadí do ní. */
  subProjectId?: string | null;
  subProjects: { id: string; name: string; parentId?: string | null }[];
}) {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <section className="mb-4 border border-stone-200 bg-white p-3 shadow-soft">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="kicker">Doklady projektu</h3>
        <Link href="/doklady" className="text-[11px] text-stone-400 underline underline-offset-2 hover:text-stone-950">
          Přehled dokladů
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <UploadDialog
          projectId={projectId}
          subProjectId={subProjectId}
          types={[
            { value: "receipt", label: "Účtenka" },
            { value: "invoice", label: "Faktura" },
          ]}
          defaultType="receipt"
          label="Nahrát doklad"
          title="Nahrát účtenku nebo fakturu"
          hint="Přetáhni soubory sem nebo je vyber. Fotky se ořežou a narovnají."
          variant="primary"
          allowNewType={false}
          onUploaded={({ ok, failed }) =>
            setMsg(failed ? null : ok > 1 ? `Nahráno ${ok} dokladů.` : "Doklad nahrán.")
          }
        />
        <ReceiptScan
          compact
          projects={[
            {
              id: projectId,
              name: projectName,
              autoRead: false,
              subProjects: subProjects.map((x) => ({ id: x.id, name: x.name })),
            },
          ]}
          initial={[]}
          defaultSubProjectId={subProjectId ?? ""}
        />
      </div>

      {msg && (
        <p className="mt-2 text-xs text-emerald-700">
          {msg}{" "}
          <Link href="/doklady" className="underline underline-offset-2">
            Zkontrolovat v Dokladech
          </Link>
        </p>
      )}
    </section>
  );
}
