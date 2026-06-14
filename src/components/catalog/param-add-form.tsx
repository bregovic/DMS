"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { addParam } from "@/server/actions/process-tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ParamAddForm({ operationId }: { operationId: string }) {
  const [state, action, pending] = useActionState(addParam, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="operationId" value={operationId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32 space-y-1">
          <Label htmlFor="p-key">Klíč</Label>
          <Input id="p-key" name="key" placeholder="delka" required />
        </div>
        <div className="w-40 space-y-1">
          <Label htmlFor="p-label">Popisek</Label>
          <Input id="p-label" name="label" placeholder="Délka" required />
        </div>
        <div className="w-20 space-y-1">
          <Label htmlFor="p-unit">MJ</Label>
          <Input id="p-unit" name="unit" placeholder="m" />
        </div>
        <div className="w-24 space-y-1">
          <Label htmlFor="p-def">Výchozí</Label>
          <Input id="p-def" name="defaultValue" type="number" step="0.0001" placeholder="—" />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <Plus className="size-4" />
          Přidat
        </Button>
      </div>
      {state?.error && (
        <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
