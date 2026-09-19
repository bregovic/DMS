"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, X } from "lucide-react";
import { createInvoices } from "@/server/actions/invoices";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

import { INV_ATTR } from "@/lib/bulk-ids";

/**
 * Vystavení faktury (žádost o úhradu) z vybraných výkazů v Moje úkoly.
 * Za každý projekt vznikne jedna faktura; po vystavení se otevře.
 */
export function InvoiceCreateBar({ amounts }: { amounts: Record<string, number> }) {
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
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
            <Button type="button" onClick={() => setOpen(true)}>
              <FileText className="size-4" /> Vystavit fakturu
            </Button>
            <button type="button" onClick={clear} aria-label="Zrušit výběr" className="ml-auto cursor-pointer p-2 text-stone-400 hover:text-stone-950">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      {open && (
        <Dialog title="Žádost o úhradu – faktura" size="md" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                for (const id of sel) fd.append("expenseIds", id);
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
            <p className="text-sm text-stone-700">
              {sel.length} {sel.length === 1 ? "výkaz" : sel.length < 5 ? "výkazy" : "výkazů"} za{" "}
              <b>{formatCurrency(total)}</b>. Za každý projekt vznikne jedna faktura se splatností 14 dní a QR platbou;
              vlastník projektu dostane oznámení.
            </p>
            <label className="block text-xs text-stone-500">
              Poznámka na fakturu (volitelné)
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
