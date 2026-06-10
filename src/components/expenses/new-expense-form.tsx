"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createExpense } from "@/server/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { EXPENSE_KINDS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { prepareUpload } from "@/lib/client-upload";

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

const DEFAULTS_KEY = "dms-expense-defaults";

type Vendor = { id: string; name: string; hourlyRate?: number | null };

function loadDefaults(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(DEFAULTS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function NewExpenseForm({
  projectId,
  subProjectId,
  vendors,
  categories,
  docTypes,
  statuses,
  defaults,
}: {
  projectId: string;
  subProjectId?: string;
  vendors: Vendor[];
  categories: { key: string; label: string }[];
  docTypes: { value: string; label: string }[];
  statuses: { key: string; label: string }[];
  defaults?: {
    kind?: string | null;
    category?: string | null;
    currency?: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Přednost: výchozí hodnoty projektu → poslední použité (localStorage) → pevné
  const [d] = useState(loadDefaults);
  const [kind, setKind] = useState(defaults?.kind || d.kind || "expense");
  const [category, setCategory] = useState(
    defaults?.category || d.category || "materials",
  );
  const [currency, setCurrency] = useState(
    defaults?.currency || d.currency || "CZK",
  );
  const [amountMode, setAmountMode] = useState(d.amountMode || "fixed");
  const [rate, setRate] = useState("");
  const [hours, setHours] = useState("");

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="h-11 px-6 text-base">
        <Plus className="size-5" />
        Přidat výdaj
      </Button>
    );
  }

  const total =
    Number(hours.replace(",", ".")) * Number(rate.replace(",", ".")) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-4 py-12">
      <div className="w-full max-w-lg border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Nový záznam</h3>
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
            if (saving) return;
            setSaving(true);
            try {
              const f = fd.get("file");
              if (f instanceof File && f.size > 0) {
                fd.set("file", await prepareUpload(f));
              }
              await createExpense(fd);
            } catch (err) {
              window.alert(
                err instanceof Error ? err.message : "Uložení selhalo.",
              );
              setSaving(false);
              return;
            }
            try {
              localStorage.setItem(
                DEFAULTS_KEY,
                JSON.stringify({
                  kind: String(fd.get("kind") || ""),
                  category: String(fd.get("category") || ""),
                  currency: String(fd.get("currency") || ""),
                  amountMode: String(fd.get("amountMode") || ""),
                }),
              );
            } catch {}
            formRef.current?.reset();
            setHours("");
            setRate("");
            setSaving(false);
            setOpen(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="subProjectId" value={subProjectId ?? ""} />
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
            <Label htmlFor="title">Název / popis činnosti</Label>
            <Input id="title" name="title" placeholder="Např. Zdění příčky" required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Dodavatel</Label>
              <Combobox
                name="vendorId"
                items={vendors.map((v) => ({
                  id: v.id,
                  label: v.name,
                  hourlyRate: v.hourlyRate,
                }))}
                defaultId={d.vendorId}
                placeholder="Hledat dodavatele…"
                onSelect={(item) => {
                  if (item?.hourlyRate != null) setRate(String(item.hourlyRate));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategorie</Label>
              <select
                id="category"
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

          {amountMode === "fixed" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Částka</Label>
                <Input id="amount" name="amount" type="number" step="0.01" min="0" placeholder="0" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Měna</Label>
                <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
                  <option value="CZK">CZK</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="hours">Hodiny</Label>
                  <Input id="hours" name="hours" type="number" step="0.25" min="0" placeholder="0" value={hours} onChange={(e) => setHours(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Sazba / h</Label>
                  <Input id="rate" name="rate" type="number" step="0.01" min="0" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Měna</Label>
                  <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date">Datum</Label>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">Sken / účtenka</Label>
              <input id="file" name="file" type="file" accept="image/*,application/pdf,capture=camera" className="block w-full text-xs text-stone-600 file:mr-2 file:border-0 file:bg-stone-100 file:px-2 file:py-2.5 file:text-stone-950" />
              <select name="scanType" defaultValue="receipt" className="h-7 w-full rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-600 focus-visible:outline-none focus-visible:border-stone-950">
                {docTypes.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Splatnost</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="variableSymbol">VS</Label>
              <Input id="variableSymbol" name="variableSymbol" inputMode="numeric" placeholder="—" />
            </div>
            <div className="space-y-1.5">
              <Label>Úhrada</Label>
              <label className="flex h-10 items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" name="paid" className="size-4 accent-stone-950" />
                Uhrazeno
              </label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage">Stav</Label>
            <select id="stage" name="stage" defaultValue="" className={fieldClass}>
              <option value="">— bez stavu —</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Poznámka (volitelné)</Label>
            <textarea id="description" name="description" rows={2} className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:outline-none focus-visible:border-stone-950" />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Ukládám…" : "Uložit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
