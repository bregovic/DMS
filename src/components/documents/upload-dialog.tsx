"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UploadForm } from "@/components/documents/upload-form";

/**
 * Nahrávání pod jedním tlačítkem: otevře dialog s plochou pro přetažení
 * i výběr souborů. Na telefonu přes celou obrazovku, na počítači karta.
 */
export function UploadDialog({
  projectId,
  subProjectId,
  types,
  defaultType = "other",
  label = "Nahrát dokumenty",
  title = "Nahrát dokumenty",
  hint,
  variant = "outline",
  allowNewType = true,
}: {
  projectId: string;
  /** Otevřená složka – doklad se do ní zařadí. */
  subProjectId?: string | null;
  types: { value: string; label: string }[];
  defaultType?: string;
  label?: string;
  title?: string;
  hint?: string;
  variant?: "outline" | "primary";
  /** Smí uživatel zavést nový typ dokumentu? (ve frontě dokladů ne) */
  allowNewType?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const zavrit = () => {
    setOpen(false);
    router.refresh();
  };
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
        <Dialog title={title} size="lg" onClose={zavrit}>
          <div className="space-y-3 p-5">
            {hint && <p className="text-xs text-stone-500">{hint}</p>}
            <UploadForm
              projectId={projectId}
              subProjectId={subProjectId}
              types={types}
              defaultType={defaultType}
              allowNewType={allowNewType}
              // Nahráno bez chyby = hotovo, dialog nemá co dál nabízet.
              // Když něco selhalo, zůstane otevřený s hláškou.
              onUploaded={({ failed }) => {
                if (!failed) zavrit();
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={zavrit}>
              Hotovo
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
}
