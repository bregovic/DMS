"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateExpense } from "@/server/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { EXPENSE_KINDS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

type Vendor = { id: string; name: string; hourlyRate?: number | null };

export type ExpenseEdit = {
  id: string;
  projectId: string;
  title: string;
  kind: string;
  category: string;
  currency: string;
  amount: number;
  hours: number | null;
  rate: number | null;
  date: string; // yyyy-mm-dd
  dueDate: string | null; // yyyy-mm-dd
  variableSymbol: string | null;
  description: string | null;
  vendorId: string | null;
  subProjectId: string | null;
  stage: string | null;
};

export function EditExpenseForm({
  expense,
  vendors,
  categories,
  subProjects,
  statuses,
}: {
  expense: ExpenseEdit;
  vendors: Vendor[];
  categories: { key: string; label: string }[];
  subProjects: { id: string; name: string }[];
  statuses: { key: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(expense.kind);
  const [category, setCategory] = useState(expense.category);
  const [currency, setCurrency] = useState(expense.currency);
  const [amountMode, setAmountMode] = useState(expense.hours != null ? "hourly" : "fixed");
  // záporná částka = příjem (tak se to ukládá, aby součty daly saldo)
  const [isIncome, setIsIncome] = useState(Number(expense.amount) < 0);
  const [rate, setRate] = useState(expense.rate != null ? String(expense.rate) : "");
  const [hours, setHours] = useState(expense.hours != null ? String(expense.hours) : "");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Upravit"
        className="flex size-8 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
      >
        <Pencil className="size-4" />
      </button>
    );
  }

  const total = Number(hours.replace(",", ".")) * Number(rate.replace(",", ".")) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-0 py-0 sm:p-4 sm:py-12">
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Upravit výdaj</h3>
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
              await updateExpense(fd);
            } catch (err) {
              window.alert(err instanceof Error ? err.message : "Uložení selhalo.");
              return;
            }
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="id" value={expense.id} />
          <input type="hidden" name="projectId" value={expense.projectId} />
          <input type="hidden" name="amountMode" value={amountMode} />

          {/* Typ záznamu */}
          <div className="flex gap-2">
            {EXPENSE_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`h-8 flex-1 border text-xs font-medium transition-colors cursor-pointer ${
                  kind === k.value
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-300 text-stone-600 hover:border-stone-950"
                }`}
              >
                {k.label}
              </button>
            ))}
            <input type="hidden" name="kind" value={kind} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ee-title">Název / popis činnosti</Label>
            <Input id="ee-title" name="title" defaultValue={expense.title} required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Dodavatel</Label>
              <Combobox
                name="vendorId"
                items={vendors.map((v) => ({ id: v.id, label: v.name, hourlyRate: v.hourlyRate }))}
                defaultId={expense.vendorId ?? undefined}
                placeholder="Hledat dodavatele…"
                onSelect={(item) => {
                  if (amountMode === "hourly" && item?.hourlyRate != null && !rate) {
                    setRate(String(item.hourlyRate));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ee-category">Kategorie</Label>
              <select
                id="ee-category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fieldClass}
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ee-sub">Složka (subprojekt)</Label>
            <select
              id="ee-sub"
              name="subProjectId"
              defaultValue={expense.subProjectId ?? ""}
              className={fieldClass}
            >
              <option value="">— bez složky (root) —</option>
              {subProjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Režim částky */}
          <div className="flex gap-2">
            {[
              { v: "fixed", l: "Částka" },
              { v: "hourly", l: "Hodiny × sazba" },
            ].map((m) => (
              <button
                key={m.v}
                type="button"
                onClick={() => setAmountMode(m.v)}
                className={`h-8 flex-1 border text-xs font-medium transition-colors cursor-pointer ${
                  amountMode === m.v
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-300 text-stone-600 hover:border-stone-950"
                }`}
              >
                {m.l}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              name="isIncome"
              checked={isIncome}
              onChange={(e) => setIsIncome(e.target.checked)}
              className="size-4 accent-stone-950"
            />
            Příjem (přičte se k saldu)
          </label>

          {amountMode === "fixed" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ee-amount">{isIncome ? "Částka příjmu" : "Částka"}</Label>
                <Input
                  id="ee-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  // v poli se ukazuje kladné číslo, znaménko řeší zaškrtávátko
                  defaultValue={Math.abs(Number(expense.amount))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ee-currency">Měna</Label>
                <select id="ee-currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
                  <option value="CZK">CZK</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ee-hours">Hodiny</Label>
                  <Input id="ee-hours" name="hours" type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ee-rate">Sazba / h</Label>
                  <Input id="ee-rate" name="rate" type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ee-currency2">Měna</Label>
                  <select id="ee-currency2" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
                    <option value="CZK">CZK</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <p className="mt-2 text-sm text-stone-500">
                Celkem: <span className="font-mono text-stone-950">{formatCurrency(total, currency)}</span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ee-date">Datum</Label>
              <DateInput id="ee-date" name="date" defaultValue={expense.date} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ee-due">Splatnost</Label>
              <DateInput id="ee-due" name="dueDate" defaultValue={expense.dueDate ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ee-vs">VS</Label>
              <Input id="ee-vs" name="variableSymbol" inputMode="numeric" defaultValue={expense.variableSymbol ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ee-stage">Stav</Label>
              <select id="ee-stage" name="stage" defaultValue={expense.stage ?? ""} className={fieldClass}>
                <option value="">— bez stavu —</option>
                {statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ee-desc">Poznámka (volitelné)</Label>
            <textarea
              id="ee-desc"
              name="description"
              rows={2}
              defaultValue={expense.description ?? ""}
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
