"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText } from "lucide-react";

export type BrowserItem = {
  docId: string;
  originalName: string;
  metaLabel: string; // "název výdaje · datum · částka · velikost"
  exported: boolean;
};

export function AttachmentsBrowser({
  projectId,
  items,
  sub,
  from,
  to,
}: {
  projectId: string;
  items: BrowserItem[];
  sub: string | null;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allChecked = items.length > 0 && sel.size === items.length;
  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSel(allChecked ? new Set() : new Set(items.map((i) => i.docId)));

  async function download(ids: string[] | null) {
    if (busy) return;
    if (ids && ids.length === 0) return;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (sub) params.set("sub", sub);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (ids) params.set("ids", ids.join(","));
      const res = await fetch(
        `/api/projects/${projectId}/documents/zip?${params.toString()}`,
      );
      if (!res.ok) {
        window.alert(await res.text().catch(() => "Stažení selhalo."));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const fname = m ? decodeURIComponent(m[1]) : "prilohy.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSel(new Set());
      router.refresh(); // zobrazí odznaky „staženo"
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Stažení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-stone-200 pb-2">
        <label className="flex items-center gap-2 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="size-4 accent-stone-950"
          />
          {sel.size > 0 ? `${sel.size} vybráno` : "Vybrat vše"}
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {sel.size > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => download(Array.from(sel))}
              className="flex h-8 items-center gap-1.5 bg-stone-950 px-3 text-xs font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-40 cursor-pointer"
            >
              <Download className="size-3.5" />
              {busy ? "Stahuji…" : `Stáhnout vybrané (${sel.size})`}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => download(null)}
            className="flex h-8 items-center gap-1.5 border border-stone-300 px-3 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-40 cursor-pointer"
          >
            <Download className="size-3.5" />
            {busy && sel.size === 0 ? "Stahuji…" : "Stáhnout vše (ZIP)"}
          </button>
        </div>
      </div>

      <ul>
        {items.map((it) => (
          <li
            key={it.docId}
            className={`flex items-center gap-3 border-b border-stone-200 py-3 ${
              sel.has(it.docId) ? "bg-stone-50" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={sel.has(it.docId)}
              onChange={() => toggle(it.docId)}
              className="size-4 shrink-0 accent-stone-950"
            />
            <a
              href={`/api/documents/${it.docId}`}
              target="_blank"
              rel="noreferrer"
              className="group flex min-w-0 flex-1 items-center gap-3"
            >
              <FileText className="size-4 shrink-0 text-stone-400" />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-stone-950 underline-offset-4 group-hover:underline">
                    {it.originalName}
                  </span>
                  {it.exported && (
                    <span className="shrink-0 border border-emerald-300 bg-emerald-50 px-1 py-0.5 text-[10px] font-normal uppercase tracking-wide text-emerald-700">
                      staženo
                    </span>
                  )}
                </span>
                <span className="kicker mt-0.5 block">{it.metaLabel}</span>
              </span>
            </a>
            <a
              href={`/api/documents/${it.docId}`}
              download
              className="shrink-0 text-stone-400 transition-colors hover:text-stone-950"
              title="Stáhnout"
            >
              <Download className="size-4" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
