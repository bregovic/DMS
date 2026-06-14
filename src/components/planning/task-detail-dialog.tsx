"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  getTaskDetail,
  updateTaskPlan,
  scheduleTaskByAvailability,
  createTask,
  deleteTask,
} from "@/server/actions/tasks";
import {
  createRequestForTask,
  linkRequestToTask,
  unlinkRequestFromTask,
  setLinkedRequestStatus,
  createExpenseForTask,
  linkExpenseToTask,
  unlinkExpenseFromTask,
} from "@/server/actions/procurement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";
import { taskStatusLabel, TASK_STATUSES, REQUEST_STATUSES, requestStatusLabel } from "@/lib/constants";
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
  const reqTitle = useRef<HTMLInputElement>(null);
  const reqLead = useRef<HTMLInputElement>(null);
  const reqLink = useRef<HTMLSelectElement>(null);
  const expTitle = useRef<HTMLInputElement>(null);
  const expAmount = useRef<HTMLInputElement>(null);
  const expLink = useRef<HTMLSelectElement>(null);
  const subTitle = useRef<HTMLInputElement>(null);
  const subDays = useRef<HTMLInputElement>(null);

  async function reload() {
    setD(await getTaskDetail(id));
    onSaved?.();
  }
  async function act(fn: (fd: FormData) => Promise<unknown>, entries: Record<string, string>) {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(entries).forEach(([k, v]) => fd.set(k, v));
      await fn(fd);
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Akce selhala.");
    }
    setSaving(false);
  }

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

  async function handleDelete() {
    if (!d) return;
    const what =
      d.kind === "phase"
        ? "tuto fázi (smažou se i její dílčí úkoly)"
        : "tento úkol";
    if (!window.confirm(`Opravdu smazat ${what}?`)) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("id", d.id);
      await deleteTask(fd);
      onSaved?.();
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Smazání selhalo.");
      setSaving(false);
    }
  }

  const folderHref = d
    ? `/projects/${d.projectId}${d.subProjectId ? `?sub=${d.subProjectId}` : ""}`
    : "#";

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
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

            <div className="space-y-1.5">
              <Label htmlFor="dd-title">{d.kind === "phase" ? "Název fáze" : "Název úkolu"}</Label>
              {d.canEdit ? (
                <Input key={`t-${d.id}`} id="dd-title" name="title" defaultValue={d.title} required />
              ) : (
                <p className="text-base font-medium text-stone-950">{d.title}</p>
              )}
              <p className="kicker mt-0.5">
                {taskStatusLabel(d.status)}
                {` · hotovo ${d.percentDone} %`}
                {d.profession ? ` · ${d.profession}` : ""}
                {d.estimateDays ? ` · odhad ${d.estimateDays} d` : ""}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dd-desc">Popis</Label>
              <textarea
                key={`d-${d.id}`}
                id="dd-desc"
                name="description"
                rows={2}
                defaultValue={d.description ?? ""}
                disabled={!d.canEdit}
                className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950 disabled:opacity-60"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dd-status">Stav</Label>
              {d.canEdit ? (
                <select
                  key={`st-${d.id}-${d.status}`}
                  id="dd-status"
                  name="status"
                  defaultValue={d.status}
                  className={fieldClass}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-stone-700">{taskStatusLabel(d.status)}</p>
              )}
            </div>

            {(() => {
              const lock = d.kind === "phase" || !d.canEdit;
              return (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="dd-start">Začátek</Label>
                      <Input key={`s-${d.startDate}`} id="dd-start" name="startDate" type="date" defaultValue={d.startDate ?? ""} disabled={lock} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dd-due">Termín</Label>
                      <Input key={`e-${d.dueDate}`} id="dd-due" name="dueDate" type="date" defaultValue={d.dueDate ?? ""} disabled={lock} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dd-pct">Hotovo (%)</Label>
                    <Input key={`p-${d.percentDone}`} id="dd-pct" name="percentDone" type="number" min={0} max={100} defaultValue={d.percentDone ?? 0} disabled={lock} />
                  </div>

                  {d.kind === "phase" && (
                    <p className="text-[11px] text-stone-400">
                      Termín i % fáze se počítají z dílčích úkolů (proto je nelze u fáze přímo měnit).
                    </p>
                  )}
                </>
              );
            })()}

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

            {/* Přidat dílčí úkol (jen u fáze) */}
            {d.kind === "phase" && d.canEdit && (
              <div className="space-y-2 border-t border-stone-200 pt-4">
                <p className="kicker">Přidat dílčí úkol</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="nt-title">Název</Label>
                    <Input ref={subTitle} id="nt-title" placeholder="Co je potřeba udělat" />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label htmlFor="nt-days">Odhad (dny)</Label>
                    <Input ref={subDays} id="nt-days" type="number" min={0} placeholder="1" />
                  </div>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const tt = subTitle.current?.value.trim();
                      if (!tt) return;
                      act(createTask, {
                        projectId: d.projectId,
                        kind: "task",
                        parentId: d.id,
                        title: tt,
                        estimateDays: subDays.current?.value ?? "",
                        status: "todo",
                      }).then(() => {
                        if (subTitle.current) subTitle.current.value = "";
                        if (subDays.current) subDays.current.value = "";
                      });
                    }}
                  >
                    Přidat
                  </Button>
                </div>
                <p className="text-[11px] text-stone-400">
                  Po přidání se rozvrh automaticky přepočítá podle návazností a délek.
                </p>
              </div>
            )}

            {/* ŽÁDANKY (procurement) */}
            <div className="space-y-2 border-t border-stone-200 pt-4">
              <p className="kicker">Žádanky</p>
              {d.requests.length === 0 && (
                <p className="text-xs text-stone-400">Žádná žádanka.</p>
              )}
              {d.requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <Link href={folderHref} className="truncate font-medium text-stone-800 hover:text-stone-950 hover:underline">
                      {r.title}
                    </Link>
                    <p className={`kicker mt-0.5 ${r.late ? "!text-red-600" : ""}`}>
                      {requestStatusLabel(r.status)}
                      {r.vendorName ? ` · ${r.vendorName}` : ""}
                      {r.orderBy ? ` · objednat do ${r.orderBy}` : ""}
                      {r.late ? " · ⚠ pozdě!" : ""}
                    </p>
                  </div>
                  {d.canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <select
                        value={r.status}
                        onChange={(e) => act(setLinkedRequestStatus, { requestId: r.id, status: e.target.value })}
                        className="h-7 border border-stone-300 bg-white px-1 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
                      >
                        {REQUEST_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        title="Odpojit"
                        onClick={() => act(unlinkRequestFromTask, { requestId: r.id })}
                        className="text-stone-400 hover:text-red-600 cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {d.canEdit && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="nr-title">Nová žádanka</Label>
                      <Input ref={reqTitle} id="nr-title" defaultValue={d.title} placeholder="Co poptat" />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label htmlFor="nr-lead">Lhůta (dny)</Label>
                      <Input ref={reqLead} id="nr-lead" type="number" min={0} placeholder="0" />
                    </div>
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => act(createRequestForTask, { taskId: d.id, title: reqTitle.current?.value ?? "", leadDays: reqLead.current?.value ?? "" })}
                    >
                      Přidat
                    </Button>
                  </div>
                  {d.candidateRequests.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select ref={reqLink} className={fieldClass + " h-8 flex-1"} defaultValue="">
                        <option value="">— připojit existující žádanku —</option>
                        {d.candidateRequests.map((c) => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => reqLink.current?.value && act(linkRequestToTask, { taskId: d.id, requestId: reqLink.current.value })}
                      >
                        Připojit
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* VÝDAJE */}
            <div className="space-y-2 border-t border-stone-200 pt-4">
              <p className="kicker">Výdaje</p>
              {d.expenses.length === 0 && (
                <p className="text-xs text-stone-400">Žádný výdaj.</p>
              )}
              {d.expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={folderHref} className="truncate text-stone-800 hover:text-stone-950 hover:underline">
                    {e.title}
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-stone-600">{formatCurrency(e.amount)}</span>
                    {d.canEdit && (
                      <button
                        type="button"
                        title="Odpojit"
                        onClick={() => act(unlinkExpenseFromTask, { expenseId: e.id })}
                        className="text-stone-400 hover:text-red-600 cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {d.canEdit && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="ne-title">Nový výdaj</Label>
                      <Input ref={expTitle} id="ne-title" defaultValue={d.title} placeholder="Popis výdaje" />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label htmlFor="ne-amount">Částka</Label>
                      <Input ref={expAmount} id="ne-amount" type="number" min={0} placeholder="0" />
                    </div>
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => act(createExpenseForTask, { taskId: d.id, title: expTitle.current?.value ?? "", amount: expAmount.current?.value ?? "" })}
                    >
                      Přidat
                    </Button>
                  </div>
                  {d.candidateExpenses.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select ref={expLink} className={fieldClass + " h-8 flex-1"} defaultValue="">
                        <option value="">— připojit existující výdaj —</option>
                        {d.candidateExpenses.map((c) => (
                          <option key={c.id} value={c.id}>{c.title} ({formatCurrency(c.amount)})</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => expLink.current?.value && act(linkExpenseToTask, { taskId: d.id, expenseId: expLink.current.value })}
                      >
                        Připojit
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-3">
                {d.canDelete && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDelete}
                    className="text-xs text-red-600 underline-offset-4 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Smazat
                  </button>
                )}
                <Link href={folderHref} className="text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline">
                  Otevřít ve složce →
                </Link>
              </div>
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
    </ModalBackdrop>
  );
}
