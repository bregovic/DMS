"use client";

import { useState } from "react";
import { Download, ExternalLink, Eye } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

/**
 * Náhled dokladu rovnou v aplikaci – obrázek nebo PDF v dialogu, na telefonu
 * přes celou obrazovku. Bez odskoku na jinou stránku; stáhnout nebo otevřít
 * v novém okně jde z hlavičky.
 */
export function DocPreview({
  documentId,
  name,
  mimeType,
  label,
  className = "",
}: {
  documentId: string;
  name: string;
  mimeType?: string | null;
  /** Text tlačítka; bez něj je jen ikona oka. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const url = `/api/documents/${documentId}`;
  const isPdf = (mimeType ?? "").includes("pdf") || /\.pdf$/i.test(name);
  const isImage = (mimeType ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(name);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Zobrazit ${name}`}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 border border-stone-300 px-2 text-xs text-stone-700 transition-colors hover:border-stone-950 ${className}`}
      >
        <Eye className="size-3.5" />
        {label}
      </button>

      {open && (
        <Dialog
          title={name}
          size="3xl"
          onClose={() => setOpen(false)}
          actions={
            <div className="flex items-center gap-1">
              <a
                href={url}
                download={name}
                title="Stáhnout"
                className="flex size-8 items-center justify-center text-stone-500 transition-colors hover:bg-stone-950 hover:text-white"
              >
                <Download className="size-4" />
              </a>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title="Otevřít v novém okně"
                className="flex size-8 items-center justify-center text-stone-500 transition-colors hover:bg-stone-950 hover:text-white"
              >
                <ExternalLink className="size-4" />
              </a>
            </div>
          }
        >
          <div className="bg-stone-100">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={name} className="mx-auto max-h-[75vh] w-auto max-w-full object-contain" />
            ) : isPdf ? (
              <object data={url} type="application/pdf" className="h-[75vh] w-full">
                {/* na mobilech PDF v objektu nefunguje – nabídneme otevření */}
                <div className="p-6 text-center text-sm text-stone-600">
                  Náhled PDF tenhle prohlížeč neumí.
                  <a href={url} target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-2">
                    Otevřít soubor
                  </a>
                </div>
              </object>
            ) : (
              <div className="p-6 text-center text-sm text-stone-600">
                Tenhle typ souboru neumím zobrazit.
                <a href={url} download={name} className="ml-1 underline underline-offset-2">
                  Stáhnout
                </a>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
