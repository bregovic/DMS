"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { getExpenseEditData, updateExpense } from "@/server/actions/expenses";
import { claimedTotals } from "@/lib/vat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { EXPENSE_KINDS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

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
  taxDate: string | null; // DUZP, yyyy-mm-dd
  docNumber: string | null;
  deductible: boolean;
  hasTaxData: boolean; // doklad s DPH – daňová pole má smysl ukazovat
};

export function EditExpenseForm({
  expense,
  vendors,
  categories,
  subProjects,
  statuses,
  projectName,
  autoOpen = false,
}: {
  expense: ExpenseEdit;
  vendors: Vendor[];
  categories: { key: string; label: string }[];
  subProjects: { id: string; name: string; parentId?: string | null }[];
  statuses: { key: string; label: string }[];
  projectName?: string;
  /** Otevřít hned – přehled dokladů na výdaj odkazuje přes ?edit=. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [kind, setKind] = useState(expense.kind);
  const [category, setCategory] = useState(expense.category);
  const [currency, setCurrency] = useState(expense.currency);
  const [amountMode, setAmountMode] = useState(expense.hours != null ? "hourly" : "fixed");
  // záporná částka = příjem (tak se to ukládá, aby součty daly saldo)
  const [isIncome, setIsIncome] = useState(Number(expense.amount) < 0);
  const [rate, setRate] = useState(expense.rate != null ? String(expense.rate) : "");
  const [hours, setHours] = useState(expense.hours != null ? String(expense.hours) : "");
  const [danove, setDanove] = useState<Awaited<ReturnType<typeof getExpenseEditData>> | null>(null);

  // Položky dokladu se načtou až při otevření – na stránce projektu by jen
  // nafoukly data, která skoro nikdo neotevře.
  useEffect(() => {
    if (!open) return;
    let zruseno = false;
    getExpenseEditData(expense.id)
      .then((d: Awaited<ReturnType<typeof getExpenseEditData>>) => !zruseno && setDanove(d))
      .catch(() => {});
    return () => {
      zruseno = true;
    };
  }, [open, expense.id]);

  const setPolozka = (id: string, patch: { category?: string | null; deductible?: boolean }) =>
    setDanove((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : d));

  const narok = danove ? claimedTotals(danove.docRows, danove.items) : null;
  const kraceno = !!danove && danove.items.some((i) => !i.deductible) && danove.docRows.length > 0;

  // Složky jsou stromové – v nabídce se vnoření ukáže odsazením.
  const cestaSlozky = (id: string): string => {
    const s = subProjects.find((x) => x.id === id);
    if (!s) return "";
    return s.parentId ? `${cestaSlozky(s.parentId)} › ${s.name}` : s.name;
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Upravit"
        className="flex size-11 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer sm:size-8"
      >
        <Pencil className="size-4" />
      </button>
    );
  }

  const total = Number(hours.replace(",", ".")) * Number(rate.replace(",", ".")) || 0;

  return (
    <Dialog title="Upravit výdaj" size="lg" onClose={() => setOpen(false)}>
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

          <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2">
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
            <Label>Zařazení</Label>
            {danove ? (
              <Combobox
                key={danove.targets.length}
                name="moveTo"
                items={danove.targets.map((t) => ({ id: t.value, label: t.label }))}
                defaultId={`${expense.projectId}:${expense.subProjectId ?? ""}`}
                placeholder="Hledat projekt nebo složku…"
                allowEmpty={false}
                clearOnFocus
              />
            ) : (
              <p className={`${fieldClass} flex items-center text-stone-400`}>
                {projectName ? `${projectName}${expense.subProjectId ? ` › ${cestaSlozky(expense.subProjectId)}` : ""}` : "Načítám…"}
              </p>
            )}
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
            Příjem
          </label>

          {amountMode === "fixed" ? (
            <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-3">
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

          <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-3">
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

          <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2">
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

          {expense.hasTaxData && (
            <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 border-t border-stone-200 pt-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ee-duzp">DUZP</Label>
                <DateInput id="ee-duzp" name="taxDate" defaultValue={expense.taxDate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ee-docnum">Číslo dokladu</Label>
                <Input id="ee-docnum" name="docNumber" defaultValue={expense.docNumber ?? ""} />
              </div>
              <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="deductible"
                  defaultChecked={expense.deductible}
                  className="size-4 accent-stone-900"
                />
                Zahrnout do DPH
              </label>
            </div>
          )}

          {danove && danove.items.length > 0 && (
            <div className="space-y-2 border-t border-stone-200 pt-4">
              <Label>Položky dokladu</Label>
              <input type="hidden" name="items" value={JSON.stringify(danove.items.map((i) => ({ id: i.id, category: i.category, deductible: i.deductible })))} />
              <div className="max-h-64 overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-stone-200 text-left text-stone-500">
                      <th className="w-10 py-1 text-center font-medium">DPH</th>
                      <th className="py-1 font-medium">Popis</th>
                      <th className="py-1 font-medium">Kategorie</th>
                      <th className="py-1 text-right font-medium">Sazba</th>
                      <th className="py-1 text-right font-medium">Částka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {danove.items.map((i) => (
                      <tr key={i.id} className={`border-b border-stone-100 ${i.deductible ? "" : "text-stone-400"}`}>
                        <td className="py-1 text-center">
                          <input
                            type="checkbox"
                            checked={i.deductible}
                            onChange={(e) => setPolozka(i.id, { deductible: e.target.checked })}
                            aria-label={`Do přiznání: ${i.description}`}
                            className="size-4 accent-stone-900"
                          />
                        </td>
                        <td className="py-1 pr-2">{i.description}</td>
                        <td className="py-1 pr-2">
                          <select
                            value={i.category ?? ""}
                            onChange={(e) => setPolozka(i.id, { category: e.target.value || null })}
                            aria-label={`Kategorie: ${i.description}`}
                            className="h-7 w-full max-w-36 cursor-pointer border border-stone-200 bg-white px-1 text-xs text-stone-700 focus-visible:border-stone-950 focus-visible:outline-none"
                          >
                            <option value="">—</option>
                            {categories.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 text-right whitespace-nowrap">{i.vatRate != null ? `${i.vatRate} %` : "–"}</td>
                        <td className="py-1 text-right font-mono">{formatCurrency(i.amount, danove.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {narok && (
                <p className="text-xs text-stone-600">
                  Do přiznání jde základ{" "}
                  <span className="font-mono text-stone-950">
                    {formatCurrency(kraceno ? narok.base : danove.docBase ?? narok.base, danove.currency)}
                  </span>{" "}
                  a daň{" "}
                  <span className="font-mono text-stone-950">
                    {formatCurrency(kraceno ? narok.vat : danove.docVat ?? narok.vat, danove.currency)}
                  </span>
                </p>
              )}
            </div>
          )}

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
