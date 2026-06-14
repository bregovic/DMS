"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createCatalogWish } from "@/server/actions/process-tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WishForm() {
  const [state, action, pending] = useActionState(createCatalogWish, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="w-title">Chybějící činnost</Label>
          <Input id="w-title" name="title" placeholder="Např. Montáž sádrokartonového podhledu" required />
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="w-note">Poznámka (volitelné)</Label>
          <Input id="w-note" name="note" placeholder="Detail, rozměry, materiál…" />
        </div>
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" />
          Zapsat
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
