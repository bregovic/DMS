"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createExpense } from "@/server/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function NewExpenseForm({
  projectId,
  vendors,
}: {
  projectId: string;
  vendors: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Přidat výdaj
      </Button>
    );
  }

  return (
    <div className="border border-stone-300 bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
        <h3 className="kicker">Nový výdaj</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-stone-400 hover:text-stone-950 cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        ref={formRef}
        action={async (fd) => {
          await createExpense(fd);
          formRef.current?.reset();
          setOpen(false);
        }}
        className="space-y-5 p-5"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <div className="space-y-1.5">
          <Label htmlFor="title">Název</Label>
          <Input id="title" name="title" placeholder="Např. Nové dveře" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Částka</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Měna</Label>
            <select id="currency" name="currency" defaultValue="CZK" className={fieldClass}>
              <option value="CZK">CZK</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="category">Kategorie</Label>
            <select id="category" name="category" defaultValue="materials" className={fieldClass}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Datum</Label>
            <Input id="date" name="date" type="date" defaultValue={today} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendorId">Dodavatel (volitelné)</Label>
          <select id="vendorId" name="vendorId" defaultValue="" className={fieldClass}>
            <option value="">— bez dodavatele —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Poznámka (volitelné)</Label>
          <textarea
            id="description"
            name="description"
            rows={2}
            className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Zrušit
          </Button>
          <Button type="submit">Uložit výdaj</Button>
        </div>
      </form>
    </div>
  );
}
