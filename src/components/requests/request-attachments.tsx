"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Paperclip, Sparkles, Upload } from "lucide-react";
import { attachRequestFiles, deleteDocument } from "@/server/actions/documents";
import { startExtraction } from "@/server/actions/extraction";
import { DeleteButton } from "@/components/ui/delete-button";
import { ExtractionDialog } from "@/components/requests/extraction-dialog";

export type RequestDoc = {
  id: string;
  originalName: string;
  summary: string | null;
  isEmail: boolean;
  size: number;
  canDelete: boolean;
  /** Poslední vytěžení přes AI (#33). */
  ai?: { id: string; status: string; error: string | null } | null;
  canExtract?: boolean;
};

/** Stav vytěžení u přílohy: tlačítko / běží / návrh k potvrzení / hotovo. */
function AiChip({ d, onOpen }: { d: RequestDoc; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!d.canExtract) return null;
  const run = async () => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("documentId", d.id);
    try {
      await startExtraction(fd);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nepodařilo se spustit.");
    }
    setBusy(false);
  };
  const base = "flex shrink-0 items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[11px]";
  const st = d.ai?.status;
  if (busy || st === "running")
    return (
      <span className={`${base} border-stone-200 text-stone-500`}>
        <Loader2 className="size-3 animate-spin" /> AI čte nabídku…
      </span>
    );
  if (st === "ready")
    return (
      <button type="button" onClick={() => onOpen(d.ai!.id)} className={`${base} cursor-pointer border-orange-400 bg-orange-50 text-orange-800 hover:bg-orange-100`}>
        <Sparkles className="size-3" /> Návrh k potvrzení
      </button>
    );
  const again = (label: string, cls: string, title?: string) => (
    <button type="button" onClick={run} title={title ?? err ?? undefined} className={`${base} cursor-pointer ${cls}`}>
      <Sparkles className="size-3" /> {err ? "Nejde spustit" : label}
    </button>
  );
  if (st === "applied") return again("Založeno · znovu", "border-emerald-300 text-emerald-700 hover:border-emerald-600");
  if (st === "error") return again("AI chyba · znovu", "border-red-300 text-red-700 hover:border-red-600", d.ai?.error ?? undefined);
  if (st === "dismissed") return again("Zamítnuto · znovu", "border-stone-300 text-stone-500 hover:border-stone-950");
  return again("Vyhodnotit AI", "border-stone-300 text-stone-600 hover:border-stone-950");
}

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".eml,.msg,.pdf,image/*,.doc,.docx,.xls,.xlsx";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * E-maily a přílohy u hlavičky žádanky (#32).
 *
 * Soubory se nahrávají po jednom - server actions mají strop 15 MB na
 * jedno odeslání a deset nabídek po pár MB by se do něj nevešlo. Na
 * počítači jde soubory (i e-mail vytažený z pošty) přetáhnout rovnou sem.
 */
export function RequestAttachments({
  projectId,
  requestId,
  docs,
  canAdd,
}: {
  projectId: string;
  requestId: string;
  docs: RequestDoc[];
  canAdd: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [aiOpen, setAiOpen] = useState<string | null>(null);
  const router = useRouter();

  // Dokud AI čte nabídku, obnovovat stránku – výsledek se objeví sám.
  const running = docs.some((d) => d.ai?.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);

  async function upload(list: FileList | File[]) {
    const files = [...list];
    if (!files.length) return;
    setError(null);
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`Soubor „${tooBig.name}" je větší než 8 MB.`);
      return;
    }
    for (let i = 0; i < files.length; i++) {
      setProgress(files.length > 1 ? `Nahrávám ${i + 1}/${files.length}…` : "Nahrávám…");
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("requestId", requestId);
      fd.append("files", files[i]);
      try {
        await attachRequestFiles(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nahrání selhalo.");
        break;
      }
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!canAdd && docs.length === 0) return null;

  return (
    <div
      onDragOver={(e) => {
        if (!canAdd) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canAdd) return;
        e.preventDefault();
        setDragOver(false);
        upload(e.dataTransfer.files);
      }}
      className={`mt-2 border border-dashed px-3 py-2 transition-colors ${
        dragOver ? "border-stone-950 bg-stone-50" : "border-stone-200"
      }`}
    >
      {docs.length > 0 && (
        <ul className="mb-1.5 space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="group flex items-start gap-2 text-sm">
              {d.isEmail ? (
                <Mail className="mt-0.5 size-4 shrink-0 text-stone-500" />
              ) : (
                <Paperclip className="mt-0.5 size-4 shrink-0 text-stone-500" />
              )}
              <a
                href={`/api/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-stone-900 underline-offset-4 group-hover:underline">
                  {d.summary ?? d.originalName}
                </span>
                {d.summary && (
                  <span className="block truncate text-[11px] text-stone-400">
                    {d.originalName} · {formatBytes(d.size)}
                  </span>
                )}
              </a>
              <AiChip d={d} onOpen={setAiOpen} />
              {d.canDelete && (
                <span className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <DeleteButton action={deleteDocument} fields={{ id: d.id }} confirm="Smazat tuto přílohu?" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
          <button
            type="button"
            disabled={!!progress}
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-stone-600 underline-offset-4 hover:text-stone-950 hover:underline disabled:opacity-50 cursor-pointer"
          >
            <Upload className="size-3.5" />
            {progress ?? "Přiložit e-mail nebo nabídku"}
          </button>
          <span className="hidden text-[11px] text-stone-400 sm:inline">nebo sem soubory přetáhni</span>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {aiOpen && (
        <ExtractionDialog
          id={aiOpen}
          onClose={() => {
            setAiOpen(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
