"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { uploadDocument } from "@/server/actions/documents";

export function UploadForm({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("file", file);
    startTransition(async () => {
      try {
        await uploadDocument(fd);
        if (inputRef.current) inputRef.current.value = "";
      } catch {
        setError("Nahrání selhalo. Zkus to znovu.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 border border-dashed border-stone-400 bg-transparent px-4 py-6 text-sm text-stone-600 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-60 cursor-pointer"
      >
        <Upload className="size-4" />
        {isPending ? "Nahrávám…" : "Nahrát dokument / sken"}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,capture=camera"
        onChange={onChange}
      />
      {error && <p className="mt-2 text-sm text-stone-700">{error}</p>}
    </div>
  );
}
