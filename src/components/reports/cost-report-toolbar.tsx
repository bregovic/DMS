"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileDown, Printer, RefreshCw } from "lucide-react";
import { rerunCostReport, saveCostReportPdf } from "@/server/actions/cost-report";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { chybaAkce } from "@/lib/chyba-akce";

const btn =
  "inline-flex h-9 cursor-pointer items-center gap-1.5 border border-stone-300 bg-white px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-50";

/** Strany reportu → PDF (A4 na výšku); přesahující stranu rozdělí. */
async function reportPdf(fileName: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pages = [...document.querySelectorAll<HTMLElement>(".rp-page")];
  let first = true;
  for (const el of pages) {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const sliceH = Math.floor((canvas.width * 297) / 210);
    for (let y = 0; y < canvas.height; y += sliceH) {
      const h = Math.min(sliceH, canvas.height - y);
      if (h < 40 && y > 0) break; // zbytek okraje
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = h;
      part.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, (h * 210) / canvas.width);
    }
  }
  return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
}

export function CostReportToolbar({
  id,
  backHref,
  fileName,
  prompt,
  documentId,
  ready,
}: {
  id: string;
  backHref: string;
  fileName: string;
  prompt: string | null;
  documentId: string | null;
  ready: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(documentId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rerun, setRerun] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const started = useRef(false);

  // Hotový report bez PDF: PDF se vytvoří a uloží do dokumentů samo (jednou).
  useEffect(() => {
    if (!ready || saved || started.current) return;
    started.current = true;
    (async () => {
      setSaving(true);
      try {
        // počkat na písma, ať se do PDF nepropíše náhradní font
        await document.fonts?.ready;
        const fd = new FormData();
        fd.set("id", id);
        fd.set("file", await reportPdf(fileName));
        const res = await saveCostReportPdf(fd);
        setSaved(res.documentId);
      } catch (e) {
        setSaveError(chybaAkce(e, "PDF se nepodařilo uložit."));
      } finally {
        setSaving(false);
      }
    })();
  }, [ready, saved, id, fileName]);

  return (
    <div className="no-print sticky top-0 z-10 mb-6 border-b border-stone-200 bg-stone-100/95 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-2 py-3">
        <Link href={backHref} className={btn}>
          <ArrowLeft className="size-4" /> Reporty
        </Link>
        <span className="flex-1" />
        {ready && (
          <>
            {saving && <span className="text-sm text-stone-500">Ukládám PDF…</span>}
            {saveError && <span className="text-sm text-red-700">{saveError}</span>}
            {saved && (
              <a href={`/api/documents/${saved}`} target="_blank" rel="noreferrer" className={btn}>
                <FileDown className="size-4" /> Stáhnout PDF
              </a>
            )}
            <button type="button" className={btn} onClick={() => window.print()}>
              <Printer className="size-4" /> Tisk
            </button>
          </>
        )}
        <button type="button" className={btn} onClick={() => setRerun(true)}>
          <RefreshCw className="size-4" /> Přepočítat
        </button>
      </div>

      {rerun && (
        <Dialog title="Přepočítat report" size="md" onClose={() => setRerun(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              try {
                const res = await rerunCostReport(fd);
                setRerun(false);
                setBusy(false);
                router.push(`/report/${res.id}`);
              } catch (e) {
                window.alert(chybaAkce(e, "Report se nepodařilo spustit."));
                setBusy(false);
              }
            }}
            className="space-y-4 p-5"
          >
            <input type="hidden" name="id" value={id} />
            <div className="space-y-1.5">
              <Label htmlFor="rr-prompt">Upřesnění</Label>
              <textarea
                id="rr-prompt"
                name="prompt"
                rows={4}
                defaultValue={prompt ?? ""}
                placeholder="Např. denní sazby dodavatelů, plochy (fasáda, střecha), co v plánu chybí"
                className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRerun(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Spouštím…" : "Přepočítat"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </div>
  );
}
