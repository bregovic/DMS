"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createProject } from "@/server/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PROJECT_TYPES } from "@/lib/constants";

export function NewProjectForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nový projekt
      </Button>
    );
  }

  return (
    <Card className="border-indigo-200">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Nový projekt</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <form action={createProject} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Název</Label>
            <Input id="name" name="name" placeholder="Např. Náš dům" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">Typ</Label>
              <select
                id="type"
                name="type"
                defaultValue="house"
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.emoji} {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Barva</Label>
              <input
                id="color"
                name="color"
                type="color"
                defaultValue="#6366f1"
                className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Popis (volitelné)</Label>
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
            <Button type="submit">Vytvořit</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
