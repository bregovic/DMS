"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { uploadDocument } from "@/server/actions/documents";
import { prepareUpload } from "@/lib/client-upload";

type DocType = { value: string; label: string };

/** Dokumentace stavby: skeny, PDF, plánky (DWG/DXF), Word, Excel, ZIP. */
const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip,.txt,.csv,.eml,.msg";

/**
 * Nahrání dokumentů projektu. Víc souborů najednou (i přetažením) –
 * technická dokumentace bývá desítka plánků. Každý soubor jde na server
 * zvlášť kvůli stropu 15 MB na jedno odeslání.
 */
export function UploadForm({
  projectId,
  types,
  defaultType = "other",
  compact = false,
}: {
  projectId: string;
  types: DocType[];
  /** Předvybraný typ (např. účtenka u dokladů). */
  defaultType?: string;
  /** Kompaktní režim – jen řádek s výběrem a tlačítkem. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(defaultType);
  const [newType, setNewType] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function upload(list: FileList | File[]) {
    const files = [...list];
    if (!files.length) return;
    if (type === "__new__" && !newType.trim()) {
      setError("Zadej název nového typu.");
      return;
    }
    setError(null);
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(files.length > 1 ? `Nahrávám ${i + 1}/${files.length}…` : "Nahrávám…");
      try {
        const prepared = await prepareUpload(files[i]);
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("type", type);
        if (type === "__new__") fd.set("newType", newType.trim());
        fd.set("file", prepared);
        await uploadDocument(fd);
      } catch (err) {
        failed.push(`${files[i].name}: ${err instanceof Error ? err.message : "nahrání selhalo"}`);
      }
    }
    setProgress(null);
    if (failed.length) setError(failed.join(" · "));
    if (inputRef.current) inputRef.current.value = "";
    setNewType("");
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
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        disabled={!!progress}
        className={`flex w-full flex-col items-center justify-center gap-1 border border-dashed px-4 py-6 text-sm transition-colors disabled:opacity-60 cursor-pointer ${
          dragOver
            ? "border-stone-950 bg-stone-950 text-white"
            : "border-stone-400 bg-transparent text-stone-600 hover:border-stone-950 hover:bg-stone-950 hover:text-white"
        }`}
      >
        <span className="flex items-center gap-2">
          <Upload className="size-4" />
          {progress ?? "Nahrát dokumenty (i víc najednou)"}
        </span>
        {!progress && (
          <span className="text-[11px] opacity-70">
            nebo sem soubory přetáhni · PDF, fotky, plánky DWG/DXF, Word, Excel, ZIP · do 14 MB
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPT}
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
