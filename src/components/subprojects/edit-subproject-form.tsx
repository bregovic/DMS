"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateSubProject } from "@/server/actions/subprojects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectAccess } from "@/components/projects/project-access";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export type SubEdit = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  budget: number | null;
  startDate: string | null; // yyyy-mm-dd
  deadline: string | null; // yyyy-mm-dd
  dependsOnId: string | null;
};

export function EditSubProjectForm({
  sub,
  siblings,
  members,
}: {
  sub: SubEdit;
  siblings: { id: string; name: string }[];
  members: { email: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Upravit subprojekt"
        className="flex size-7 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
      >
        <Pencil className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-md border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Upravit subprojekt</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <form
          action={async (fd) => {
            try {
              await updateSubProject(fd);
            } catch (err) {
              window.alert(err instanceof Error ? err.message : "Uložení selhalo.");
              return;
            }
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="id" value={sub.id} />
          <input type="hidden" name="projectId" value={sub.projectId} />

          <div className="space-y-1.5">
            <Label htmlFor="es-name">Název</Label>
            <Input id="es-name" name="name" defaultValue={sub.name} required autoFocus />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="es-start">Začátek</Label>
              <Input id="es-start" name="startDate" type="date" defaultValue={sub.startDate ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-deadline">Termín</Label>
              <Input id="es-deadline" name="deadline" type="date" defaultValue={sub.deadline ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-budget">Rozpočet</Label>
              <Input id="es-budget" name="budget" type="number" step="0.01" min="0" defaultValue={sub.budget ?? ""} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="es-dep">Navazuje na (volitelné)</Label>
            <select id="es-dep" name="dependsOnId" defaultValue={sub.dependsOnId ?? ""} className={fieldClass}>
              <option value="">— bez vazby —</option>
              {siblings
                .filter((s) => s.id !== sub.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="es-desc">Popis (volitelné)</Label>
            <textarea
              id="es-desc"
              name="description"
              rows={2}
              defaultValue={sub.description ?? ""}
              className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit">Uložit</Button>
          </div>
        </form>

        <div className="border-t border-stone-200 p-5">
          <p className="kicker mb-2">Přístup ke složce</p>
          <ProjectAccess
            projectId={sub.projectId}
            subProjectId={sub.id}
            members={members}
            canManage
          />
        </div>
      </div>
    </div>
  );
}
