"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, HandCoins, X } from "lucide-react";
import { createInvoices } from "@/server/actions/invoices";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

import { INV_ATTR } from "@/lib/bulk-ids";

/**
 * Vyúčtování vybraných výkazů v Moje úkoly: faktura (podnikatel), nebo
 * žádost o úhradu (bez živnosti). Za každý projekt vznikne jeden doklad
 * s QR platbou; po vystavení se otevře.
 */
export function InvoiceCreateBar({ amounts }: { amounts: Record<string, number> }) {
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"invoice" | "request">("invoice");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[${INV_ATTR}]`));
  useEffect(() => {
    const on = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.hasAttribute?.(INV_ATTR)) setSel(boxes().filter((b) => b.checked).map((b) => b.value));
    };
    document.addEventListener("change", on);
    return () => document.removeEventListener("change", on);
  }, []);
  const clear = () => {
    boxes().forEach((b) => (b.checked = false));
    setSel([]);
  };
  const total = sel.reduce((a, id) => a + (amounts[id] ?? 0), 0);

  return (
    <>
      {sel.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-stone-300 bg-white/95 px-4 py-3 shadow-lift backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
            <span className="text-sm text-stone-950">
              Vybráno {sel.length} · <b>{formatCurrency(total)}</b>
            </span>
            <Button
              type="button"
              onClick={() => {
                setKind("invoice");
                setOpen(true);
              }}
            >
              <FileText className="size-4" /> Vystavit fakturu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setKind("request");
                setOpen(true);
              }}
            >
              <HandCoins className="size-4" /> Žádost o úhradu
            </Button>
            <button type="button" onClick={clear} aria-label="Zrušit výběr" className="ml-auto cursor-pointer p-2 text-stone-400 hover:text-stone-950">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      {open && (
        <Dialog title={kind === "invoice" ? "Vystavit fakturu" : "Žádost o úhradu"} size="md" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                for (const id of sel) fd.append("expenseIds", id);
                fd.set("kind", kind);
                const r = await createInvoices(fd);
                if (r.error) throw new Error(r.error);
                clear();
                setOpen(false);
                if (r.ids[0]) router.push(`/faktury/${r.ids[0]}`);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Fakturu se nepodařilo vystavit.");
              }
              setBusy(false);
            }}
            className="space-y-3 p-5"
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "invoice", l: "Faktura", d: "podnikatel s IČO" },
                  { v: "request", l: "Žádost o úhradu", d: "bez živnosti, není daňový doklad" },
                ] as const
              ).map((k) => (
                <button
                  key={k.v}
                  type="button"
                  onClick={() => setKind(k.v)}
                  className={`cursor-pointer border px-3 py-2 text-left transition-colors ${
                    kind === k.v ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-700 hover:border-stone-950"
                  }`}
                >
                  <span className="block text-sm font-medium">{k.l}</span>
                  <span className={`block text-[11px] ${kind === k.v ? "text-stone-300" : "text-stone-400"}`}>{k.d}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-stone-700">
              {sel.length} {sel.length === 1 ? "výkaz" : sel.length < 5 ? "výkazy" : "výkazů"} za{" "}
              <b>{formatCurrency(total)}</b>. Za každý projekt vznikne {kind === "invoice" ? "jedna faktura" : "jedna žádost"} se splatností 14 dní a QR platbou;
              vlastník projektu dostane oznámení.
            </p>
            <label className="block text-xs text-stone-500">
              Poznámka (volitelné)
              <input
                name="note"
                placeholder="Např. práce za září 2026"
                className="mt-1 flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
              />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Vystavuji…" : "Vystavit"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
