"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileStack, Loader2 } from "lucide-react";
import { scanProjectDocuments } from "@/server/actions/doc-scan";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { ReceiptScan } from "@/components/expenses/receipt-scan";
import { DocScanReview } from "@/components/expenses/doc-scan-review";
import { DocPreview } from "@/components/documents/doc-preview";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { formatCurrency, formatDate } from "@/lib/utils";

export type InboxDoc = {
  id: string;
  name: string;
  mimeType: string | null;
  createdAt: string;
  uploader: string;
  scanId: string | null;
  /** uploaded = nahráno, čeká na přečtení */
  status: "uploaded" | "running" | "ready" | "error";
  /** kam to podle vytěžení patří – návrh, v kontrole jde změnit */
  target: "expense" | "income" | null;
  supplier: string | null;
  number: string | null;
  total: number | null;
  currency: string | null;
};

const STATUS: Record<InboxDoc["status"], { label: string; cls: string }> = {
  uploaded: { label: "nahráno", cls: "text-stone-500" },
  running: { label: "čtu doklad…", cls: "text-stone-500" },
  ready: { label: "ke kontrole", cls: "text-orange-700" },
  error: { label: "nepodařilo se přečíst", cls: "text-red-600" },
};

/**
 * Doklady projektu na jednom místě, nad záložkami: nahrávají se průběžně
 * (i z telefonu), vytěžení se pouští až potom – po jednom, nebo všechno
 * najednou. U přečteného dokladu je vidět návrh, jestli je to výdaj nebo
 * příjem; změnit to jde v kontrole před založením.
 */
export function DocInbox({
  projectId,
  projectName,
  canScan,
  categories,
  subProjects,
  docs,
}: {
  projectId: string;
  projectName: string;
  /** smí spustit vytěžení (vlastník, spolusprávce, nebo komu to vlastník povolil) */
  canScan: boolean;
  categories: { key: string; label: string }[];
  subProjects: { id: string; name: string }[];
  docs: InboxDoc[];
}) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const unread = docs.filter((d) => d.status === "uploaded");

  return (
    <section className="mb-4 border border-stone-200 bg-white p-3 shadow-soft">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="kicker">Doklady projektu</h3>
        <p className="text-[11px] text-stone-400">
          {canScan ? "Nahraj průběžně, přečti jednotlivě nebo hromadně." : "Doklady zpracuje majitel projektu."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <UploadDialog
          projectId={projectId}
          types={[
            { value: "receipt", label: "Účtenka" },
            { value: "invoice", label: "Faktura" },
          ]}
          defaultType="receipt"
          label="Nahrát doklad"
          title="Nahrát účtenku nebo fakturu"
          hint="Přetáhni soubory sem nebo je vyber. Fotky se ořežou a narovnají."
          variant="primary"
        />
        <ReceiptScan compact projects={[{ id: projectId, name: projectName, autoRead: false }]} initial={[]} />
        {canScan && unread.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setErr(null);
              start(async () => {
                try {
                  const fd = new FormData();
                  fd.set("projectId", projectId);
                  await scanProjectDocuments(fd);
                  router.refresh();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Nepodařilo se spustit.");
                }
              });
            }}
            className="flex h-10 cursor-pointer items-center gap-2 border border-stone-300 px-4 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileStack className="size-4" />}
            Přečíst vše ({unread.length})
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      <AutoRefresh when={docs.some((d) => d.status === "running")} />

      {docs.length > 0 && (
        <ul className="mt-3 border-t border-stone-200">
          {docs.map((d) => {
            const st = STATUS[d.status];
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 py-2 text-sm last:border-0">
                <span className="min-w-0 flex-1 basis-48 truncate text-stone-900" title={d.name}>
                  {d.supplier ?? d.name}
                  {d.number && <span className="text-xs text-stone-400"> · č. {d.number}</span>}
                  <span className="block text-[11px] text-stone-400">
                    {formatDate(d.createdAt)} · {d.uploader}
                  </span>
                </span>
                {d.total != null && <span className="font-mono text-stone-950">{formatCurrency(d.total, d.currency ?? "CZK")}</span>}
                <span className={`text-xs ${st.cls}`}>
                  {st.label}
                  {d.status === "ready" && d.target && (
                    <span className="text-stone-500"> · návrh: {d.target === "income" ? "příjem" : "výdaj"}</span>
                  )}
                </span>
                <DocPreview documentId={d.id} name={d.name} mimeType={d.mimeType} />
                {canScan && (
                  <DocScanReview
                    scanId={d.scanId}
                    documentId={d.id}
                    projectId={projectId}
                    subProjects={subProjects}
                    categories={categories}
                    label={d.status === "ready" ? "Zkontrolovat" : d.status === "error" ? "Zkusit znovu" : "Přečíst doklad"}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
