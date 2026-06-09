"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { uploadDocument } from "@/server/actions/documents";
import { prepareUpload } from "@/lib/client-upload";

type DocType = { value: string; label: string };

export function UploadForm({
  projectId,
  types,
}: {
  projectId: string;
  types: DocType[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("other");
  const [newType, setNewType] = useState("");

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === "__new__" && !newType.trim()) {
      setError("Zadej název nového typu.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const prepared = await prepareUpload(file);
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("type", type);
        if (type === "__new__") fd.set("newType", newType.trim());
        fd.set("file", prepared);
        await uploadDocument(fd);
        if (inputRef.current) inputRef.current.value = "";
        setNewType("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nahrání selhalo.");
      }
    });
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 flex-1 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950"
        >
          {types.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
          <option value="__new__">+ Přidat typ…</option>
        </select>
        {type === "__new__" && (
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="Název typu"
            className="h-9 flex-1 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
          />
        )}
      </div>
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
