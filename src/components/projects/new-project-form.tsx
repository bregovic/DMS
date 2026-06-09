"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createProject } from "@/server/actions/projects";
import type { ProjectTypeOption } from "@/server/project-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function NewProjectForm({ types }: { types: ProjectTypeOption[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(types[0]?.key ?? "other");

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nový projekt
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/30 p-4 pt-24">
      <div className="w-full max-w-md border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nový projekt</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <form action={createProject} className="space-y-5 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Název</Label>
            <Input id="name" name="name" placeholder="Např. Byt Praha" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Typ</Label>
            <select
              id="type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={fieldClass}
            >
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
              <option value="__new__">+ Přidat nový typ…</option>
            </select>
          </div>
          {type === "__new__" && (
            <div className="space-y-1.5">
              <Label htmlFor="newType">Název nového typu</Label>
              <Input
                id="newType"
                name="newType"
                placeholder="Např. Hudební nástroje"
                required
              />
              <p className="text-xs text-stone-400">
                Přidá se do sdíleného číselníku typů.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="description">Popis (volitelné)</Label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit">Vytvořit</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
