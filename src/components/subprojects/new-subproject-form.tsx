"use client";

import { useRef, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { createSubProject } from "@/server/actions/subprojects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewSubProjectForm({
  projectId,
  parentId,
}: {
  projectId: string;
  parentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FolderPlus className="size-4" />
        Subprojekt
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-0 py-0 sm:p-4 sm:py-16">
      <div className="w-full max-w-md border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nový subprojekt</h3>
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
            await createSubProject(fd);
            formRef.current?.reset();
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="parentId" value={parentId ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="name">Název</Label>
            <Input id="name" name="name" placeholder="Např. Střecha" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget">Rozpočet (volitelné)</Label>
            <Input id="budget" name="budget" type="number" step="0.01" min="0" placeholder="0" />
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
          <div className="flex justify-end gap-2">
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
