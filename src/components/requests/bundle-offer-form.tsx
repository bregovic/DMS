"use client";

import { useRef, useState } from "react";
import { createBundleOffer, updateBundleOffer } from "@/server/actions/bundles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

export type BundleOfferView = {
  id: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorLabel: string;
  price: number | null;
  priceWithoutVat: number | null;
  deliveryDate: string | null; // yyyy-mm-dd
  note: string | null;
  status: string;
  selected: boolean;
  canEdit: boolean;
  /** Části po žádankách: co nabídka kryje a za kolik (cena nepovinná). */
  parts: { requestId: string; price: number | null }[];
  docs: { id: string; originalName: string }[];
};

const fieldClass =
  "flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950";

/**
 * Společná nabídka na balíček (#40). Hlavní číslo je celková cena; rozpad
 * po žádankách je dobrovolný – zaškrtnutá žádanka bez ceny znamená „firma
 * ji kryje, ale cenu nerozepsala“. Přesně tak, jak nabídky chodí.
 */
export function BundleOfferForm({
  mode,
  bundleId,
  offer,
  requests,
  vendors,
  trigger,
}: {
  mode: "create" | "edit";
  bundleId?: string;
  offer?: BundleOfferView;
  requests: { id: string; title: string }[];
  vendors: { id: string; label: string }[];
  trigger: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const partOf = new Map((offer?.parts ?? []).map((p) => [p.requestId, p]));

  if (!open) return <>{trigger(() => setOpen(true))}</>;

  return (
    <Dialog
      title={mode === "create" ? "Nová společná nabídka" : "Upravit společnou nabídku"}
      size="md"
      onClose={() => setOpen(false)}
    >
      <form
        ref={formRef}
        action={async (fd) => {
          setBusy(true);
          setErr(null);
          try {
            if (mode === "create") await createBundleOffer(fd);
            else await updateBundleOffer(fd);
            setOpen(false);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Nepodařilo se uložit.");
          }
          setBusy(false);
        }}
        className="space-y-4 p-5"
      >
        {mode === "create" ? (
          <input type="hidden" name="bundleId" value={bundleId} />
        ) : (
          <input type="hidden" name="id" value={offer!.id} />
        )}

        <div className="space-y-1.5">
          <Label>Dodavatel (z evidence)</Label>
          <Combobox
            name="vendorId"
            items={vendors}
            defaultId={offer?.vendorId ?? undefined}
            placeholder="Hledat dodavatele…"
            emptyLabel="— mimo evidenci —"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bo-vendorName">…nebo jméno mimo evidenci</Label>
          <Input id="bo-vendorName" name="vendorName" defaultValue={offer?.vendorName ?? ""} placeholder="Např. Okna Macek" />
        </div>

        <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="bo-price">Celkem s DPH</Label>
            <Input id="bo-price" name="price" type="number" step="0.01" min="0" defaultValue={offer?.price ?? ""} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bo-net">Celkem bez DPH</Label>
            <Input
              id="bo-net"
              name="priceWithoutVat"
              type="number"
              step="0.01"
              min="0"
              defaultValue={offer?.priceWithoutVat ?? ""}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bo-delivery">Termín dodání</Label>
            <DateInput id="bo-delivery" name="deliveryDate" defaultValue={offer?.deliveryDate ?? ""} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Čeho se nabídka týká</Label>
          <ul className="border border-stone-200">
            {requests.map((r) => {
              const p = partOf.get(r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-3 py-2 last:border-b-0">
                  <label className="flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-2 text-sm text-stone-900">
                    <input
                      type="checkbox"
                      name={`cover_${r.id}`}
                      value="1"
                      defaultChecked={mode === "create" ? true : !!p}
                      className="size-4 shrink-0 cursor-pointer accent-stone-900"
                    />
                    <span className="truncate">{r.title}</span>
                  </label>
                  <Input
                    name={`part_${r.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={p?.price ?? ""}
                    placeholder="cena — nepovinné"
                    className="h-8 w-40 text-xs"
                  />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-stone-400">
            Bez rozpisu po žádankách vyplň jen Celkem.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bo-note">Komentář k nabídce</Label>
          <textarea
            id="bo-note"
            name="note"
            rows={2}
            defaultValue={offer?.note ?? ""}
            placeholder="Co je v ceně, záruka, platnost, podmínky…"
            className={fieldClass}
          />
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Zrušit
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Ukládám…" : "Uložit"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
