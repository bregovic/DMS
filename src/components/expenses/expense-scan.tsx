"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, X } from "lucide-react";
import { attachExpenseScan, deleteDocument } from "@/server/actions/documents";
import { DocPreview } from "@/components/documents/doc-preview";
import { prepareUpload } from "@/lib/client-upload";

type Doc = { id: string; originalName: string; mimeType?: string | null };

/**
 * Příloha u výdaje: účtenku nebo fakturu jde přiložit jedním klikem (typ se
 * pozná ze souboru) a rovnou si ji prohlédnout v dialogu. Drží se decentně –
 * je to jen řádek pod výdajem.
 */
export function ExpenseScan({
  projectId,
  expenseId,
  docs,
  canAttach,
}: {
  projectId: string;
  expenseId: string;
  docs: Doc[];
  canAttach: boolean;
  /** Ponecháno kvůli volajícím – typ přílohy se pozná ze souboru. */
  types?: { value: string; label: string }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    start(async () => {
      try {
        const prepared = await prepareUpload(file, { doc: true });
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("expenseId", expenseId);
        // PDF bývá faktura, fotka účtenka; opravit jde v dokladech
        fd.set("type", /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name) ? "invoice" : "receipt");
        fd.set("file", prepared);
        await attachExpenseScan(fd);
        if (inputRef.current) inputRef.current.value = "";
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : "Nahrání selhalo.");
      }
    });
  }

  if (!canAttach && docs.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {docs.map((d) => (
        <span key={d.id} className="inline-flex items-center gap-1">
          <DocPreview
            documentId={d.id}
            name={d.originalName}
            mimeType={d.mimeType}
            label={d.originalName}
            className="h-6 max-w-56 truncate border-stone-200 px-1.5 text-[11px] text-stone-500"
          />
          {canAttach && (
            <form
              action={deleteDocument}
              onSubmit={(e) => {
                if (!window.confirm("Smazat přílohu?")) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={d.id} />
              <button type="submit" title="Smazat přílohu" className="cursor-pointer text-stone-300 hover:text-stone-950">
                <X className="size-3" />
              </button>
            </form>
          )}
        </span>
      ))}
      {canAttach && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            title="Přiložit účtenku nebo fakturu (foto i PDF)"
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-stone-400 transition-colors hover:text-stone-950 disabled:opacity-60"
          >
            <Paperclip className="size-3" />
            {pending ? "nahrávám…" : docs.length ? "další příloha" : "příloha"}
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={onChange}
          />
        </>
      )}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
