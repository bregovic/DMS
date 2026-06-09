"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Plus } from "lucide-react";
import { attachExpenseScan } from "@/server/actions/documents";
import { DOCUMENT_TYPES } from "@/lib/constants";

type Doc = { id: string; originalName: string };

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
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [type, setType] = useState("receipt");

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("expenseId", expenseId);
    fd.set("type", type);
    fd.set("file", file);
    start(async () => {
      try {
        await attachExpenseScan(fd);
        if (inputRef.current) inputRef.current.value = "";
      } catch {
        setErr("Nahrání selhalo.");
      }
    });
  }

  if (!canAttach && docs.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {docs.map((d) => (
        <a
          key={d.id}
          href={`/api/documents/${d.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline"
        >
          <Paperclip className="size-3" />
          {d.originalName}
        </a>
      ))}
      {canAttach && (
        <>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-6 rounded-none border border-stone-300 bg-white px-1 text-[11px] text-stone-600 focus-visible:outline-none focus-visible:border-stone-950"
          >
            {DOCUMENT_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs text-stone-400 transition-colors hover:text-stone-950 disabled:opacity-60 cursor-pointer"
          >
            <Plus className="size-3" />
            {pending ? "nahrávám…" : "sken"}
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf,capture=camera"
            onChange={onChange}
          />
        </>
      )}
      {err && <span className="text-xs text-stone-500">{err}</span>}
    </div>
  );
}
