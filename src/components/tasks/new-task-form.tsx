"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createTask } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function NewTaskForm({
  projectId,
  subProjectId,
  statuses,
}: {
  projectId: string;
  subProjectId?: string;
  statuses: { key: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Úkol
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nový úkol</h3>
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
            try {
              await createTask(fd);
            } catch (err) {
              window.alert(err instanceof Error ? err.message : "Uložení selhalo.");
              return;
            }
            formRef.current?.reset();
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="subProjectId" value={subProjectId ?? ""} />

          <div className="space-y-1.5">
            <Label htmlFor="t-title">Název úkolu</Label>
            <Input id="t-title" name="title" placeholder="Např. Objednat materiál" required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-assignee">Komu (e‑mail, volitelné)</Label>
              <Input id="t-assignee" name="assigneeEmail" type="email" placeholder="kdo@to.cz" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-status">Stav</Label>
              <select id="t-status" name="status" defaultValue="todo" className={fieldClass}>
                {statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-start">Začátek</Label>
              <Input id="t-start" name="startDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">Termín</Label>
              <Input id="t-due" name="dueDate" type="date" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Poznámka (volitelné)</Label>
            <textarea
              id="t-desc"
              name="description"
              rows={2}
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
      </div>
    </div>
  );
}
