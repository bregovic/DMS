"use client";

import { useState } from "react";
import { Settings, Users, X } from "lucide-react";
import { updateProject } from "@/server/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectAccess } from "@/components/projects/project-access";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

type ProjectData = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  defaultKind: string | null;
  defaultCategory: string | null;
  defaultCurrency: string | null;
};

export function ProjectSettings({
  project,
  types,
  categories,
  members,
}: {
  project: ProjectData;
  types: { key: string; label: string }[];
  categories: { key: string; label: string }[];
  members: { email: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-10"
        title="Nastavení projektu"
      >
        <Settings className="size-4" />
        Nastavení
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nastavení projektu</h3>
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
            setSaving(true);
            try {
              await updateProject(fd);
            } catch (e) {
              window.alert(e instanceof Error ? e.message : "Uložení selhalo.");
              setSaving(false);
              return;
            }
            setSaving(false);
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="id" value={project.id} />

          <div className="space-y-1.5">
            <Label htmlFor="ps-name">Název</Label>
            <Input id="ps-name" name="name" defaultValue={project.name} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ps-type">Typ</Label>
              <select id="ps-type" name="type" defaultValue={project.type} className={fieldClass}>
                {types.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-desc">Popis</Label>
              <Input
                id="ps-desc"
                name="description"
                defaultValue={project.description ?? ""}
                placeholder="Volitelné"
              />
            </div>
          </div>

          <div>
            <p className="kicker mb-2">Výchozí hodnoty pro nový výdaj</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ps-kind">Druh</Label>
                <select id="ps-kind" name="defaultKind" defaultValue={project.defaultKind ?? ""} className={fieldClass}>
                  <option value="">—</option>
                  <option value="expense">Výdaj</option>
                  <option value="work">Práce</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-cat">Kategorie</Label>
                <select id="ps-cat" name="defaultCategory" defaultValue={project.defaultCategory ?? ""} className={fieldClass}>
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-cur">Měna</Label>
                <select id="ps-cur" name="defaultCurrency" defaultValue={project.defaultCurrency ?? ""} className={fieldClass}>
                  <option value="">—</option>
                  <option value="CZK">CZK</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              className="inline-flex items-center gap-2 border border-stone-300 px-3 py-2 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white cursor-pointer"
            >
              <Users className="size-4" />
              Přístup k celému projektu · {members.length}
            </button>
            <p className="mt-2 text-xs text-stone-400">
              Tady dáváš přístup k <span className="text-stone-600">celému projektu</span>.
              Přístup jen ke konkrétní složce nastav uvnitř té složky (panel „Přístup ke složce").
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zavřít
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Ukládám…" : "Uložit"}
            </Button>
          </div>
        </form>
      </div>

      {membersOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-stone-950/40 p-4 py-12">
          <div className="w-full max-w-md border border-stone-300 bg-white shadow-lift">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <h3 className="kicker">Přístup k celému projektu</h3>
              <button
                type="button"
                onClick={() => setMembersOpen(false)}
                className="text-stone-400 hover:text-stone-950 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5">
              <ProjectAccess projectId={project.id} members={members} canManage />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
