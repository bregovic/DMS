"use client";

import { useRef, useState } from "react";
import { Plus, X, Pencil } from "lucide-react";
import { createIncome, updateIncome, deleteIncome } from "@/server/actions/incomes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { INCOME_CATEGORIES, incomeCategoryLabel } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export type IncomeRow = {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  category: string;
  date: string; // yyyy-mm-dd
  subProjectName: string | null;
};

type Editing = IncomeRow | "new" | null;

export function IncomeSection({
  projectId,
  subProjectId,
  incomes,
  canAdd,
  canManage,
}: {
  projectId: string;
  subProjectId?: string;
  incomes: IncomeRow[];
  canAdd: boolean;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const isNew = editing === "new";
  const cur = editing && editing !== "new" ? editing : null;

  async function onDelete(row: IncomeRow) {
    if (!window.confirm(`Smazat příjem „${row.title}"?`)) return;
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("projectId", projectId);
    try {
      await deleteIncome(fd);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Smazání selhalo.");
    }
  }

  return (
    <div className="order-3">
      <div className="mb-4 flex items-center justify-between border-b border-stone-300/80 pb-2">
        <h2 className="kicker">Příjmy · {incomes.length}</h2>
        {canAdd && (
          <Button onClick={() => setEditing("new")} variant="outline" size="sm">
            <Plus className="size-4" />
            Přidat příjem
          </Button>
        )}
      </div>

      {incomes.length === 0 ? (
        <p className="py-3 text-sm text-stone-500">
          Žádné příjmy na této úrovni. Přidej dotaci, vklad, úvěr nebo prodej.
        </p>
      ) : (
        <div>
          {incomes.map((i) => (
            <div
              key={i.id}
              className="group flex flex-col gap-2 border-b border-stone-200 py-3.5 sm:flex-row sm:items-baseline sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-950">
                  <span className="break-words">{i.title}</span>
                </p>
                <p className="kicker mt-0.5">
                  {incomeCategoryLabel(i.category)} · {formatDate(new Date(i.date))}
                  {i.subProjectName ? ` · ${i.subProjectName}` : ""}
                </p>
                {i.description && (
                  <p className="mt-0.5 text-xs text-stone-500">{i.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-medium text-emerald-700">
                  + {formatCurrency(i.amount, i.currency)}
                </span>
                {canManage && (
                  <span className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      title="Upravit"
                      onClick={() => setEditing(i)}
                      className="flex size-7 items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white cursor-pointer"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Smazat"
                      onClick={() => onDelete(i)}
                      className="flex size-7 items-center justify-center text-stone-400 hover:bg-red-600 hover:text-white cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-0 py-0 sm:p-4 sm:py-12">
          <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <h3 className="kicker">{isNew ? "Nový příjem" : "Úprava příjmu"}</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-stone-400 hover:text-stone-950 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <form
              ref={formRef}
              action={async (fd) => {
                if (saving) return;
                setSaving(true);
                try {
                  if (isNew) await createIncome(fd);
                  else await updateIncome(fd);
                } catch (err) {
                  window.alert(err instanceof Error ? err.message : "Uložení selhalo.");
                  setSaving(false);
                  return;
                }
                formRef.current?.reset();
                setSaving(false);
                setEditing(null);
              }}
              className="space-y-5 p-5"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="subProjectId" value={subProjectId ?? ""} />
              {cur && <input type="hidden" name="id" value={cur.id} />}

              <div className="space-y-1.5">
                <Label htmlFor="inc-title">Název / zdroj příjmu</Label>
                <Input
                  id="inc-title"
                  name="title"
                  placeholder="Např. Dotace Nová zelená úsporám"
                  defaultValue={cur?.title ?? ""}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inc-category">Kategorie</Label>
                  <select
                    id="inc-category"
                    name="category"
                    defaultValue={cur?.category ?? "dotace"}
                    className={fieldClass}
                  >
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inc-date">Datum</Label>
                  <DateInput
                    id="inc-date"
                    name="date"
                   
                    defaultValue={cur?.date ?? today}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inc-amount">Částka</Label>
                  <Input
                    id="inc-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    defaultValue={cur?.amount ?? ""}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inc-currency">Měna</Label>
                  <select
                    id="inc-currency"
                    name="currency"
                    defaultValue={cur?.currency ?? "CZK"}
                    className={fieldClass}
                  >
                    <option value="CZK">CZK</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inc-desc">Poznámka (volitelné)</Label>
                <textarea
                  id="inc-desc"
                  name="description"
                  rows={2}
                  defaultValue={cur?.description ?? ""}
                  className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Zrušit
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Ukládám…" : "Uložit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
