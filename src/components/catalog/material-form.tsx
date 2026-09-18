"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { createMaterial, updateMaterial } from "@/server/actions/process-tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

export type MaterialInput = {
  id: string;
  code: string;
  name: string;
  unit: string;
  unitPrice: number;
  priceSource: string | null;
  priceDate: string | null; // YYYY-MM-DD
  category: string | null;
  note: string | null;
};

const UNITS = ["ks", "kg", "t", "m", "m2", "m3", "bm", "l", "pytel", "bal", "paleta"];

export function MaterialForm({ material }: { material?: MaterialInput }) {
  const editing = !!material;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    editing ? updateMaterial : createMaterial,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return editing ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Upravit"
        className="text-stone-400 hover:text-stone-950 cursor-pointer"
      >
        <Pencil className="size-4" />
      </button>
    ) : (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nový materiál
      </Button>
    );
  }

  return (
    <Dialog title={editing ? "Upravit materiál" : "Nový materiál"} size="md" onClose={() => setOpen(false)}>
        <form ref={formRef} action={action} className="space-y-5 p-5">
          {editing && <input type="hidden" name="id" value={material.id} />}
          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Kód</Label>
              <Input id="code" name="code" defaultValue={material?.code} placeholder="DEK-12345" required />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Název</Label>
              <Input id="name" name="name" defaultValue={material?.name} placeholder="Cihla Porotherm 11,5" required />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit">MJ</Label>
              <Input id="unit" name="unit" list="material-units" defaultValue={material?.unit ?? "ks"} />
              <datalist id="material-units">
                {UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitPrice">Cena / MJ</Label>
              <Input id="unitPrice" name="unitPrice" type="number" step="0.01" min="0" defaultValue={material?.unitPrice ?? 0} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategorie</Label>
              <Input id="category" name="category" defaultValue={material?.category ?? ""} placeholder="zdivo" />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="priceSource">Zdroj ceny</Label>
              <Input id="priceSource" name="priceSource" defaultValue={material?.priceSource ?? ""} placeholder="DEK 2026-06" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priceDate">Datum ceny</Label>
              <DateInput id="priceDate" name="priceDate" defaultValue={material?.priceDate ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Poznámka</Label>
            <Input id="note" name="note" defaultValue={material?.note ?? ""} placeholder="volitelné" />
          </div>
          {state?.error && (
            <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Uložit"}
            </Button>
          </DialogFooter>
        </form>
    </Dialog>
  );
}
