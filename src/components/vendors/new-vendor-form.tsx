"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createVendor } from "@/server/actions/vendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VENDOR_CATEGORIES } from "@/lib/constants";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function NewVendorForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createVendor, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nový dodavatel
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/30 p-4 pt-20">
      <div className="w-full max-w-md border border-stone-300 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nový dodavatel</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <form ref={formRef} action={action} className="space-y-5 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Název dodavatele</Label>
            <Input id="name" name="name" placeholder="Např. Novák stavby s.r.o." required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail (identifikátor)</Label>
            <Input id="email" name="email" type="email" placeholder="dodavatel@firma.cz" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategorie</Label>
              <select id="category" name="category" defaultValue="construction" className={fieldClass}>
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+420…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankAccount">Bankovní účet / IBAN (volitelné)</Label>
            <Input
              id="bankAccount"
              name="bankAccount"
              placeholder="123-456789/0100 nebo CZ65…"
            />
            <p className="text-xs text-stone-400">Pro generování QR platby.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Popis (volitelné)</Label>
            <textarea
              id="description"
              name="description"
              rows={2}
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
              {pending ? "Ukládám…" : "Uložit dodavatele"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
