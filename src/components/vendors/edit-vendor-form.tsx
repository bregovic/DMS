"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateVendor } from "@/server/actions/vendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AresLookup } from "@/components/vendors/ares-lookup";
import { VENDOR_CATEGORIES } from "@/lib/constants";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

type Vendor = {
  id: string;
  name: string;
  email: string;
  category: string;
  phone: string | null;
  description: string | null;
  ico: string | null;
  dic: string | null;
  address: string | null;
  bankAccount: string | null;
  hourlyRate: number | null;
};

export function EditVendorForm({ vendor }: { vendor: Vendor }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateVendor, undefined);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Upravit"
        className="flex size-8 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
      >
        <Pencil className="size-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-md border border-stone-300 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Upravit dodavatele</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <form action={action} className="space-y-5 p-5">
          <input type="hidden" name="id" value={vendor.id} />
          <AresLookup
            initial={{ ico: vendor.ico, name: vendor.name, dic: vendor.dic, address: vendor.address }}
          />
          <div className="space-y-1.5">
            <Label htmlFor="ev-email">E-mail (identifikátor)</Label>
            <Input id="ev-email" name="email" type="email" defaultValue={vendor.email} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ev-category">Kategorie</Label>
              <select id="ev-category" name="category" defaultValue={vendor.category} className={fieldClass}>
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-phone">Telefon</Label>
              <Input id="ev-phone" name="phone" type="tel" defaultValue={vendor.phone ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ev-bank">Bankovní účet / IBAN</Label>
              <Input id="ev-bank" name="bankAccount" defaultValue={vendor.bankAccount ?? ""} placeholder="123-456/0100 / CZ65…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-rate">Hodinová sazba</Label>
              <Input id="ev-rate" name="hourlyRate" type="number" step="0.01" min="0" defaultValue={vendor.hourlyRate ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Popis</Label>
            <textarea
              id="ev-desc"
              name="description"
              rows={2}
              defaultValue={vendor.description ?? ""}
              className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
            />
          </div>
          {state?.error && (
            <p className="border-l-2 border-stone-950 bg-stone-100 px-3 py-2 text-sm text-stone-700">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Uložit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
