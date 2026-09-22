"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Mail, Paperclip, Sparkles, Upload } from "lucide-react";
import { attachRequestFiles, deleteDocument } from "@/server/actions/documents";
import { formatDate } from "@/lib/utils";
import { startExtraction, startRequestExtractions } from "@/server/actions/extraction";
import { DeleteButton } from "@/components/ui/delete-button";
import { ExtractionDialog } from "@/components/requests/extraction-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

export type RequestDoc = {
  id: string;
  originalName: string;
  /** Dodavatel (u nabídky) nebo odesílatel a předmět (u e-mailu). */
  summary: string | null;
  isEmail: boolean;
  size: number;
  /** ISO datum založení – v seznamu se ukazuje pod názvem. */
  createdAt?: string | null;
  canDelete: boolean;
  /** Poslední vytěžení přes AI (#33). */
  ai?: { id: string; status: string; error: string | null } | null;
  canExtract?: boolean;
};

/** Stav vytěžení u přílohy: tlačítko / běží / návrh k potvrzení / hotovo. */
function AiChip({ d, onOpen }: { d: RequestDoc; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  if (!d.canExtract) return null;

  // Spuštění s volitelným pokynem („je to technický list“, „jen položky HS portálu“…).
  const run = async (instructions: string) => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("documentId", d.id);
    fd.set("instructions", instructions);
    try {
      await startExtraction(fd);
      setAsk(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nepodařilo se spustit.");
    }
    setBusy(false);
  };
  const base = "flex shrink-0 items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[11px]";
  const st = d.ai?.status;
  const promptDialog = ask && (
    <Dialog title="Zpracovat přílohu" size="md" onClose={() => setAsk(false)}>
      <form
        action={async (fd) => run(String(fd.get("instructions") || ""))}
        className="space-y-3 p-5"
      >
        <p className="text-sm text-stone-600">{d.originalName}</p>
        <label className="block text-xs text-stone-500">
          Upřesnění (volitelné)
          <textarea
            name="instructions"
            rows={3}
            autoFocus
            placeholder="Např. je to technický list k HS portálu; nebo: nabídka platí jen pro okna v přízemí"
            className="mt-1 flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
          />
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <DialogFooter>
          <button type="button" onClick={() => setAsk(false)} className="h-9 cursor-pointer px-3 text-sm text-stone-600">
            Zrušit
          </button>
          <button type="submit" disabled={busy} className="h-9 cursor-pointer bg-stone-950 px-4 text-sm text-white disabled:opacity-50">
            {busy ? "Spouštím…" : "Zpracovat"}
          </button>
        </DialogFooter>
      </form>
    </Dialog>
  );
  const rerun = (
    <button
      type="button"
      onClick={() => setAsk(true)}
      title="Zpracovat znovu (s pokynem)"
      className="cursor-pointer px-1 text-[11px] text-stone-400 hover:text-stone-950"
    >
      ↻
    </button>
  );

  if (busy || st === "running")
    return (
      <span className={`${base} border-stone-200 text-stone-500`}>
        <Loader2 className="size-3 animate-spin" /> Zpracovávám přílohu…
      </span>
    );
  const open = (label: string, cls: string) => (
    <span className="flex shrink-0 items-center">
      <button type="button" onClick={() => onOpen(d.ai!.id)} className={`${base} cursor-pointer ${cls}`}>
        <Sparkles className="size-3" /> {label}
      </button>
      {rerun}
      {promptDialog}
    </span>
  );
  if (st === "ready") return open("Návrh k potvrzení", "border-orange-400 bg-orange-50 text-orange-800 hover:bg-orange-100");
  if (st === "info") return open("Údaje z dokumentu", "border-stone-300 text-stone-700 hover:border-stone-950");
  if (st === "partial") return open("Spárovat zbytek", "border-orange-300 text-orange-800 hover:bg-orange-50");
  if (st === "applied") return open("Založeno", "border-emerald-300 text-emerald-700 hover:border-emerald-600");
  const start = (label: string, cls: string, title?: string) => (
    <span className="flex shrink-0 items-center">
      <button type="button" onClick={() => setAsk(true)} title={title} className={`${base} cursor-pointer ${cls}`}>
        <Sparkles className="size-3" /> {label}
      </button>
      {promptDialog}
    </span>
  );
  if (st === "error") return start("Chyba zpracování · znovu", "border-red-300 text-red-700 hover:border-red-600", d.ai?.error ?? undefined);
  if (st === "dismissed") return start("Zamítnuto · znovu", "border-stone-300 text-stone-500 hover:border-stone-950");
  return start("Zpracovat přílohu", "border-stone-300 text-stone-600 hover:border-stone-950");
}

const MAX_BYTES = 14 * 1024 * 1024;
const ACCEPT = ".eml,.msg,.pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv,.dwg,.dxf,.zip";

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
  const [batchBusy, setBatchBusy] = useState(false);
  // Seznam příloh je rozbalovací – u žádanky s víc nabídkami zabíral
  // půl obrazovky. Rozbalí se sám, když je něco rozpracovaného.
  const [open, setOpen] = useState(false);
  // Přílohy, které jdou zpracovat a ještě zpracované nebyly.
  const unprocessed = docs.filter((d) => d.canExtract && !d.ai).length;
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
      setError(`Soubor „${tooBig.name}" je větší než 14 MB.`);
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-stone-600 hover:text-stone-950"
        >
          <Paperclip className="size-3.5" />
          Přílohy · {docs.length}
          <ChevronDown className={`size-3.5 transition-transform ${open || running ? "rotate-180" : ""}`} />
        </button>
      )}

      {docs.length > 0 && (open || running) && (
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
                  {d.summary ? `${d.summary} – ${d.originalName}` : d.originalName}
                </span>
                <span className="block truncate text-[11px] text-stone-400">
                  {[d.createdAt ? formatDate(new Date(d.createdAt)) : null, formatBytes(d.size)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
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
          {unprocessed > 0 && (
            <button
              type="button"
              disabled={batchBusy}
              onClick={async () => {
                setBatchBusy(true);
                setError(null);
                try {
                  const fd = new FormData();
                  fd.set("requestId", requestId);
                  await startRequestExtractions(fd);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Zpracování se nepodařilo spustit.");
                }
                setBatchBusy(false);
              }}
              className="ml-auto flex cursor-pointer items-center gap-1 border border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 hover:border-stone-950 disabled:opacity-50"
              title="Zpracuje všechny přílohy této žádanky, které ještě zpracované nejsou – postupně"
            >
              <Sparkles className="size-3" /> Zpracovat nové přílohy ({unprocessed})
            </button>
          )}
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
