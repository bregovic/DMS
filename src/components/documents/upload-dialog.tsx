"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { UploadForm } from "@/components/documents/upload-form";

/**
 * Nahrávání pod jedním tlačítkem: otevře dialog s plochou pro přetažení
 * i výběr souborů. Na telefonu přes celou obrazovku, na počítači karta.
 */
export function UploadDialog({
  projectId,
  types,
  defaultType = "other",
  label = "Nahrát dokumenty",
  title = "Nahrát dokumenty",
  hint,
  variant = "outline",
}: {
  projectId: string;
  types: { value: string; label: string }[];
  defaultType?: string;
  label?: string;
  title?: string;
  hint?: string;
  variant?: "outline" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const cls =
    variant === "primary"
      ? "border-stone-950 bg-stone-950 text-white hover:bg-stone-800"
      : "border-stone-300 text-stone-700 hover:border-stone-950 hover:bg-stone-950 hover:text-white";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-10 cursor-pointer items-center gap-2 border px-4 text-sm transition-colors ${cls}`}
      >
        <Upload className="size-4" />
        {label}
      </button>
      {open && (
        <Dialog
          title={title}
          size="lg"
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        >
          <div className="space-y-3 p-5">
            {hint && <p className="text-xs text-stone-500">{hint}</p>}
            <UploadForm projectId={projectId} types={types} defaultType={defaultType} />
          </div>
        </Dialog>
      )}
    </>
  );
}
