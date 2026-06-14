"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import {
  getTaskDetail,
  updateTaskPlan,
  scheduleTaskByAvailability,
} from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { taskStatusLabel } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

type Detail = Awaited<ReturnType<typeof getTaskDetail>>;

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function TaskDetailDialog({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getTaskDetail(id)
      .then((x) => live && setD(x))
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Načtení selhalo."));
    return () => {
      live = false;
    };
  }, [id]);

  async function scheduleByAvailability() {
    if (!d) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("id", d.id);
      const r = await scheduleTaskByAvailability(fd);
      setD(await getTaskDetail(d.id));
      onSaved?.();
      if (!r.enough)
        window.alert(
          `Dodavatel má od plánovaného začátku jen ${r.got} z ${r.need} potřebných dní. Termín jsem dal na poslední dostupný den (${r.due}). Doplň mu dostupnost a spusť znovu.`,
        );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Naplánování selhalo.");
    }
    setSaving(false);
  }

  const folderHref = d
    ? `/projects/${d.projectId}${d.subProjectId ? `?sub=${d.subProjectId}` : ""}`
    : "#";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-0 py-0 sm:p-4 sm:py-12"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-stone-300 bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">
            {d ? (d.kind === "phase" ? "Detail fáze" : "Detail úkolu") : "Detail"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {err && <p className="p-5 text-sm text-red-600">{err}</p>}
        {!d && !err && <p className="p-5 text-sm text-stone-500">Načítám…</p>}

        {d && (
          <form
            action={async (fd) => {
              setSaving(true);
              try {
                await updateTaskPlan(fd);
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "Uložení selhalo.");
                setSaving(false);
                return;
              }
              onSaved?.();
              onClose();
            }}
            className="space-y-5 p-5"
          >
            <input type="hidden" name="id" value={d.id} />

            {!d.canEdit && (
              <p className="border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                Jen pro čtení — úpravy může dělat vlastník projektu nebo člen
                s přístupem k této složce.
              </p>
            )}

            <div>
              <p className="text-base font-medium text-stone-950">{d.title}</p>
              <p className="kicker mt-0.5">
                {taskStatusLabel(d.status)}
                {` · hotovo ${d.percentDone} %`}
                {d.profession ? ` · ${d.profession}` : ""}
                {d.estimateDays ? ` · odhad ${d.estimateDays} d` : ""}
              </p>
              {d.description && (
                <p className="mt-1 text-sm text-stone-500">{d.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dd-start">Začátek</Label>
                <Input key={`s-${d.startDate}`} id="dd-start" name="startDate" type="date" defaultValue={d.startDate ?? ""} disabled={!d.canEdit} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dd-due">Termín</Label>
                <Input key={`e-${d.dueDate}`} id="dd-due" name="dueDate" type="date" defaultValue={d.dueDate ?? ""} disabled={!d.canEdit} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dd-pct">Hotovo (%)</Label>
              <Input id="dd-pct" name="percentDone" type="number" min={0} max={100} defaultValue={d.percentDone ?? 0} disabled={!d.canEdit} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dd-vendor">Dodavatel</Label>
              <select id="dd-vendor" name="vendorId" defaultValue={d.vendorId ?? ""} className={fieldClass} disabled={!d.canEdit}>
                <option value="">— bez dodavatele —</option>
                {d.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {d.canEdit && d.vendorId && d.estimateDays ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={scheduleByAvailability}
                  className="mt-1 text-xs text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer disabled:opacity-50"
                >
                  ⟳ Naplánovat dle dostupnosti dodavatele ({d.estimateDays} d)
                </button>
              ) : d.canEdit && !d.estimateDays ? (
                <p className="text-[11px] text-stone-400">
                  Pro plánování dle dostupnosti zadej odhad dní (v úpravě úkolu).
                </p>
              ) : null}
            </div>

            {d.candidates.length > 0 && (
              <div className="space-y-1.5">
                <Label>{d.kind === "phase" ? "Navazuje na fáze" : "Navazuje na úkoly"}</Label>
                <div className="max-h-44 space-y-1 overflow-y-auto border border-stone-200 p-2">
                  {d.candidates.map((cd) => (
                    <label key={cd.id} className="flex items-center gap-2 text-sm text-stone-700">
                      <input
                        type="checkbox"
                        name="dependsOnId"
                        value={cd.id}
                        defaultChecked={d.deps.includes(cd.id)}
                        disabled={!d.canEdit}
                        className="size-4 accent-stone-900"
                      />
                      {cd.title}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(d.requests.length > 0 || d.expenses.length > 0) && (
              <div className="space-y-2 border-t border-stone-200 pt-4">
                <p className="kicker">Související v této složce</p>
                {d.requests.map((r) => (
                  <Link key={r.id} href={folderHref} className="flex items-center justify-between gap-2 text-sm text-stone-700 hover:text-stone-950">
                    <span className="truncate">Žádanka: {r.title}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-stone-400" />
                  </Link>
                ))}
                {d.expenses.map((e) => (
                  <Link key={e.id} href={folderHref} className="flex items-center justify-between gap-2 text-sm text-stone-700 hover:text-stone-950">
                    <span className="truncate">Výdaj: {e.title}</span>
                    <span className="shrink-0 text-stone-500">{formatCurrency(e.amount)}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Link href={folderHref} className="text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline self-center">
                Otevřít ve složce →
              </Link>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Zavřít
                </Button>
                {d.canEdit && (
                  <Button type="submit" disabled={saving}>
                    {saving ? "Ukládám…" : "Uložit"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
