"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { addRecipe, updateRecipe } from "@/server/actions/process-tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";
import { OperationPicker } from "@/components/catalog/operation-picker";

export type MaterialOption = { id: string; code: string; name: string; unit: string };
export type RecipeInput = {
  id: string;
  materialId: string;
  quantityFormula: string;
  wastePct: number | null;
  note: string | null;
};

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
  const [materialId, setMaterialId] = useState(recipe?.materialId ?? "");
  const [state, action, pending] = useActionState(
    editing ? updateRecipe : addRecipe,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setMaterialId(recipe?.materialId ?? "");
      setOpen(false);
    }
  }, [state, recipe?.materialId]);

  const selMat = materials.find((m) => m.id === materialId);

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
            <Label>Materiál</Label>
            <input type="hidden" name="materialId" value={materialId} />
            {selMat ? (
              <p className="flex items-center gap-2 text-sm text-stone-700">
                <span className="font-medium text-stone-950">{selMat.name}</span>
                <span className="text-xs text-stone-400">
                  ({selMat.unit}) · {selMat.code}
                </span>
                <button
                  type="button"
                  onClick={() => setMaterialId("")}
                  className="text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline cursor-pointer"
                >
                  změnit
                </button>
              </p>
            ) : (
              <OperationPicker
                ops={materials}
                onPick={(m) => setMaterialId(m.id)}
                placeholder="Hledat materiál… (název nebo kód)"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
