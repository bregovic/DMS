"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createExpense } from "@/server/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

export function NewExpenseForm({ projectId }: { projectId: string }) {
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
    <Card className="border-indigo-200">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Nový výdaj</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
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
          className="space-y-4"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <div className="space-y-1.5">
            <Label htmlFor="title">Název</Label>
            <Input id="title" name="title" placeholder="Např. Nové dveře" required />
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
              <select id="currency" name="currency" defaultValue="CZK" className={selectClass}>
                <option value="CZK">CZK</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategorie</Label>
              <select id="category" name="category" defaultValue="materials" className={selectClass}>
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
            <Label htmlFor="description">Poznámka (volitelné)</Label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit">Uložit výdaj</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
