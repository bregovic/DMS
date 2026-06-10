"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateTask } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export type TaskEdit = {
  id: string;
  title: string;
  assigneeEmail: string | null;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  description: string | null;
  kind: string;
  parentId: string | null;
};

export function EditTaskForm({
  task,
  statuses,
  phases,
}: {
  task: TaskEdit;
  statuses: { key: string; label: string }[];
  phases: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Upravit úkol"
        className="flex size-8 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
      >
        <Pencil className="size-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">{task.kind === "phase" ? "Upravit fázi" : "Upravit úkol"}</h3>
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
              await updateTask(fd);
            } catch (err) {
              window.alert(err instanceof Error ? err.message : "Uložení selhalo.");
              return;
            }
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="id" value={task.id} />

          <div className="space-y-1.5">
            <Label htmlFor="et-title">{task.kind === "phase" ? "Název fáze" : "Název úkolu"}</Label>
            <Input id="et-title" name="title" defaultValue={task.title} required autoFocus />
          </div>

          {task.kind === "task" && phases.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="et-parent">Patří pod fázi</Label>
              <select id="et-parent" name="parentId" defaultValue={task.parentId ?? ""} className={fieldClass}>
                <option value="">— samostatný úkol —</option>
                {phases
                  .filter((p) => p.id !== task.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="et-assignee">Komu (e‑mail)</Label>
              <Input id="et-assignee" name="assigneeEmail" type="email" defaultValue={task.assigneeEmail ?? ""} placeholder="kdo@to.cz" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-status">Stav</Label>
              <select id="et-status" name="status" defaultValue={task.status} className={fieldClass}>
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
              <Label htmlFor="et-start">Začátek</Label>
              <Input id="et-start" name="startDate" type="date" defaultValue={task.startDate ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-due">Termín</Label>
              <Input id="et-due" name="dueDate" type="date" defaultValue={task.dueDate ?? ""} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-desc">Poznámka</Label>
            <textarea
              id="et-desc"
              name="description"
              rows={2}
              defaultValue={task.description ?? ""}
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
