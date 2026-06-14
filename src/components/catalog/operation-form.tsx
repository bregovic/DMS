"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { createOperation, updateOperation } from "@/server/actions/process-tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";

export type OperationInput = {
  id: string;
  code: string;
  name: string;
  unit: string;
  quantityFormula: string;
  laborFormula: string;
  description: string | null;
  category: string | null;
};

const UNITS = ["m2", "m3", "bm", "ks", "kg", "t", "hod"];

export function OperationForm({ operation }: { operation?: OperationInput }) {
  const editing = !!operation;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    editing ? updateOperation : createOperation,
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
        title="Upravit úkon"
        className="text-stone-400 hover:text-stone-950 cursor-pointer"
      >
        <Pencil className="size-4" />
      </button>
    ) : (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nový úkon
      </Button>
    );
  }

  return (
    <ModalBackdrop onClose={() => setOpen(false)}>
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">{editing ? "Upravit úkon" : "Nový úkon"}</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <form ref={formRef} action={action} className="space-y-5 p-5">
          {editing && <input type="hidden" name="id" value={operation.id} />}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="o-code">Kód</Label>
              <Input id="o-code" name="code" defaultValue={operation?.code} placeholder="ZD-PRICKA" required />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="o-name">Název</Label>
              <Input id="o-name" name="name" defaultValue={operation?.name} placeholder="Vyzdění příčky" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="o-unit">MJ úkonu</Label>
              <Input id="o-unit" name="unit" list="op-units" defaultValue={operation?.unit ?? "m2"} />
              <datalist id="op-units">
                {UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-category">Kategorie</Label>
              <Input id="o-category" name="category" defaultValue={operation?.category ?? ""} placeholder="zdění" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-qf">Vzorec množství (MJ)</Label>
            <Input id="o-qf" name="quantityFormula" defaultValue={operation?.quantityFormula ?? "1"} placeholder="delka * vyska" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-lf">Vzorec normohodin</Label>
            <Input id="o-lf" name="laborFormula" defaultValue={operation?.laborFormula ?? "0"} placeholder="1.2 * delka * vyska" />
          </div>
          <p className="text-[11px] text-stone-400">
            Vzorce počítají z klíčů parametrů úkonu (např. <code>delka</code>,{" "}
            <code>vyska</code>). Funkce: ceil, floor, round, min, max, abs, sqrt.
            Desetinná tečka.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="o-desc">Popis</Label>
            <textarea
              id="o-desc"
              name="description"
              rows={2}
              defaultValue={operation?.description ?? ""}
              className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
            />
          </div>
          {state?.error && (
            <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Uložit"}
            </Button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
