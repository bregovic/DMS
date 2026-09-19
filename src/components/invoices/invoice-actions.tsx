"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { cancelInvoice, markInvoicePaid } from "@/server/actions/invoices";

/**
 * Akce na faktuře: tisk (Uložit jako PDF v tiskovém dialogu), stažení PDF
 * (html2canvas + jsPDF – stejně jako splátkový kalendář v POS), úhrada
 * (vlastník) a storno (vystavitel).
 */
export function InvoiceActions({
  id,
  number,
  canPay,
  canCancel,
}: {
  id: string;
  number: string;
  canPay: boolean;
  canCancel: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const el = document.getElementById("invoice-sheet");
    if (!el) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = 210;
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, Math.min(h, 297));
      pdf.save(`faktura-${number}.pdf`);
    } catch {
      window.alert("PDF se nepodařilo vytvořit – použij Tisk → Uložit jako PDF.");
    }
    setBusy(false);
  }

  const btn = "flex h-9 cursor-pointer items-center gap-1.5 border px-3 text-sm transition-colors disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={`${btn} border-stone-300 text-stone-700 hover:border-stone-950`}>
        <Printer className="size-4" /> Tisk / PDF
      </button>
      <button type="button" disabled={busy} onClick={download} className={`${btn} border-stone-300 text-stone-700 hover:border-stone-950`}>
        <Download className="size-4" /> {busy ? "Připravuji…" : "Stáhnout PDF"}
      </button>
      {canPay && (
        <form
          action={async (fd) => {
            if (!window.confirm("Potvrdit, že je faktura uhrazená? Výkazy se označí jako zaplacené.")) return;
            await markInvoicePaid(fd);
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={`${btn} border-stone-950 bg-stone-950 text-white hover:bg-stone-800`}>
            Označit jako uhrazenou
          </button>
        </form>
      )}
      {canCancel && (
        <form
          action={async (fd) => {
            if (!window.confirm("Stornovat fakturu? Výkazy půjde vyfakturovat znovu.")) return;
            await cancelInvoice(fd);
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={`${btn} border-stone-300 text-red-700 hover:border-red-700`}>
            Stornovat
          </button>
        </form>
      )}
    </div>
  );
}
