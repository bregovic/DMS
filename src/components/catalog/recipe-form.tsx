"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { addRecipe, updateRecipe } from "@/server/actions/process-tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";

export type MaterialOption = { id: string; code: string; name: string; unit: string };
export type RecipeInput = {
  id: string;
  materialId: string;
  quantityFormula: string;
  wastePct: number | null;
  note: string | null;
};

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function RecipeForm({
  operationId,
  materials,
  recipe,
}: {
  operationId: string;
  materials: MaterialOption[];
  recipe?: RecipeInput;
}) {
  const editing = !!recipe;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    editing ? updateRecipe : addRecipe,
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
        title="Upravit řádek"
        className="text-stone-400 hover:text-stone-950 cursor-pointer"
      >
        <Pencil className="size-4" />
      </button>
    ) : (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Přidat materiál
      </Button>
    );
  }

  return (
    <ModalBackdrop onClose={() => setOpen(false)}>
      <div className="w-full max-w-md border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">{editing ? "Upravit materiál v receptu" : "Materiál do receptu"}</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <form ref={formRef} action={action} className="space-y-5 p-5">
          {editing ? (
            <input type="hidden" name="id" value={recipe.id} />
          ) : (
            <input type="hidden" name="operationId" value={operationId} />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="r-material">Materiál</Label>
            <select id="r-material" name="materialId" defaultValue={recipe?.materialId ?? ""} className={fieldClass} required>
              <option value="" disabled>
                — vyber materiál —
              </option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit}) · {m.code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="r-qf">Vzorec spotřeby</Label>
              <Input id="r-qf" name="quantityFormula" defaultValue={recipe?.quantityFormula ?? ""} placeholder="16 * delka * vyska" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-waste">Prořez %</Label>
              <Input id="r-waste" name="wastePct" type="number" step="0.1" min="0" defaultValue={recipe?.wastePct ?? ""} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-note">Poznámka</Label>
            <Input id="r-note" name="note" defaultValue={recipe?.note ?? ""} placeholder="volitelné" />
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
