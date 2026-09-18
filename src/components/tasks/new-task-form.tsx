"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function NewTaskForm({
  projectId,
  subProjectId,
  statuses,
  phases,
  triggerClassName,
}: {
  projectId: string;
  subProjectId?: string;
  statuses: { key: string; label: string }[];
  phases: { id: string; title: string }[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("task");
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className={triggerClassName}>
        <Plus className="size-4" />
        Úkol
      </Button>
    );
  }

  return (
    <Dialog title={kind === "phase" ? "Nová fáze" : "Nový úkol"} size="lg" onClose={() => setOpen(false)}>
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
          <input type="hidden" name="kind" value={kind} />

          <div className="flex gap-2">
            {[
              { v: "task", l: "Úkol" },
              { v: "phase", l: "Fáze projektu" },
            ].map((k) => (
              <button
                key={k.v}
                type="button"
                onClick={() => setKind(k.v)}
                className={`h-8 flex-1 border text-xs font-medium transition-colors cursor-pointer ${
                  kind === k.v
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-300 text-stone-600 hover:border-stone-950"
                }`}
              >
                {k.l}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-title">{kind === "phase" ? "Název fáze" : "Název úkolu"}</Label>
            <Input id="t-title" name="title" placeholder={kind === "phase" ? "Např. Lepení izolace" : "Např. Objednat materiál"} required autoFocus />
          </div>

          {kind === "task" && phases.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="t-parent">Patří pod fázi (volitelné)</Label>
              <select id="t-parent" name="parentId" defaultValue="" className={fieldClass}>
                <option value="">— samostatný úkol —</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-assignee">Řešitel (e-mail)</Label>
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

          <div className="grid grid-cols-2 items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-start">Začátek</Label>
              <DateInput id="t-start" name="startDate" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">Termín</Label>
              <DateInput id="t-due" name="dueDate" />
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-priority">Priorita</Label>
              <select id="t-priority" name="priority" defaultValue="" className={fieldClass}>
                <option value="">— neurčeno —</option>
                <option value="high">Vysoká</option>
                <option value="medium">Střední</option>
                <option value="low">Nízká</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-prof">Profese</Label>
              <Input id="t-prof" name="profession" placeholder="Elektrikář…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-est">Odhad (dny)</Label>
              <Input id="t-est" name="estimateDays" type="number" min={0} />
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit">Uložit</Button>
          </DialogFooter>
        </form>
    </Dialog>
  );
}
