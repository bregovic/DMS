"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createRequest } from "@/server/actions/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { REQUEST_UNITS } from "@/lib/constants";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function NewRequestForm({
  projectId,
  subProjectId,
  vendors,
  categories,
}: {
  projectId: string;
  subProjectId?: string;
  vendors: { id: string; name: string }[];
  categories: { key: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Žádanka
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nová žádanka</h3>
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
            await createRequest(fd);
            formRef.current?.reset();
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="subProjectId" value={subProjectId ?? ""} />

          <div className="space-y-1.5">
            <Label htmlFor="title">Co se poptává</Label>
            <Input id="title" name="title" placeholder="Např. Cihly Porotherm 30" required autoFocus />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Množství</Label>
              <Input id="quantity" name="quantity" type="number" step="0.01" min="0" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Jednotka</Label>
              <select id="unit" name="unit" defaultValue="ks" className={fieldClass}>
                {REQUEST_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategorie</Label>
              <select id="category" name="category" defaultValue="materials" className={fieldClass}>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Dodavatel (volitelné)</Label>
              <Combobox
                name="vendorId"
                items={vendors.map((v) => ({ id: v.id, label: v.name }))}
                placeholder="Hledat dodavatele…"
                emptyLabel="— zatím neurčen —"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="requiredDate">Požadované datum</Label>
              <Input id="requiredDate" name="requiredDate" type="date" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="price">Cena / nabídka (volitelné)</Label>
            <Input id="price" name="price" type="number" step="0.01" min="0" placeholder="0" />
            <p className="text-xs text-stone-400">
              S dodavatelem + cenou lze ze žádanky založit výdaj.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Specifikace (volitelné)</Label>
            <textarea
              id="description"
              name="description"
              rows={2}
              placeholder="Typ, rozměry, poznámky…"
              className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit">Uložit poptávku</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
