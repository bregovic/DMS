"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileStack, Loader2, Plus } from "lucide-react";
import { applyReadyScans, scanProjectDocuments } from "@/server/actions/doc-scan";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { ReceiptScan } from "@/components/expenses/receipt-scan";
import { DocScanReview } from "@/components/expenses/doc-scan-review";
import { DocPreview } from "@/components/documents/doc-preview";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDocument } from "@/server/actions/documents";
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
  /** na co upozornit před založením (duplicita, chybějící údaje) */
  issues: string[];
  duplicate: boolean;
};

function formOf(projectId: string) {
  const fd = new FormData();
  fd.set("projectId", projectId);
  return fd;
}

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
  const [msg, setMsg] = useState<string | null>(null);
  const unread = docs.filter((d) => d.status === "uploaded");
  // hotové doklady bez problémů jde založit naráz; ostatní je potřeba projít
  const ready = docs.filter((d) => d.status === "ready");
  const readyClean = ready.filter((d) => !d.duplicate && !d.issues.some((i) => i.startsWith("chybí částka")));

  return (
    <section className="mb-4 border border-stone-200 bg-white p-3 shadow-soft">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="kicker">Doklady projektu</h3>
        <p className="text-[11px] text-stone-400">
          {canScan ? "Nahrané doklady se čtou až na povel – jednotlivě, nebo celá dávka." : "Doklady zpracuje majitel projektu."}
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
        {canScan && readyClean.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Založit ${readyClean.length} dokladů podle vytěžených údajů?`)) return;
              setErr(null);
              setMsg(null);
              start(async () => {
                try {
                  const r = await applyReadyScans(formOf(projectId));
                  if ("error" in r && r.error) setErr(r.error);
                  else {
                    const skipped = r.skipped ?? [];
                    setMsg(
                      `Založeno ${r.created ?? 0} dokladů` +
                        (skipped.length ? ` · ${skipped.length} přeskočeno: ${skipped.slice(0, 3).join("; ")}` : ""),
                    );
                    router.refresh();
                  }
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Založení selhalo.");
                }
              });
            }}
            className="flex h-10 cursor-pointer items-center gap-2 border border-stone-950 bg-white px-4 text-sm text-stone-950 transition-colors hover:bg-stone-950 hover:text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Založit doklady ({readyClean.length})
          </button>
        )}
        {canScan && unread.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setErr(null);
              start(async () => {
                try {
                  await scanProjectDocuments(formOf(projectId));
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
      {msg && <p className="mt-2 text-xs text-stone-600">{msg}</p>}

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
                {d.issues.length > 0 && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${d.duplicate ? "text-amber-700" : "text-stone-500"}`}
                    title={d.issues.join(" · ")}
                  >
                    <AlertTriangle className="size-3.5" />
                    {d.duplicate ? "duplicita" : d.issues[0]}
                    {d.issues.length > 1 && ` +${d.issues.length - 1}`}
                  </span>
                )}
                <DocPreview documentId={d.id} name={d.name} mimeType={d.mimeType} />
                <DeleteButton
                  action={deleteDocument}
                  fields={{ id: d.id }}
                  confirm={`Smazat nahraný doklad „${d.name}"? Záznam ani soubor už nepůjde vrátit.`}
                />
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
