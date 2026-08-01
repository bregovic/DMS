"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, QrCode, Trash2 } from "lucide-react";
import { deleteExpense, bulkUpdateExpenses } from "@/server/actions/expenses";
import { QrAggregateModal } from "@/components/expenses/qr-aggregate-modal";
import { PaymentInfo } from "@/components/expenses/payment-info";
import { ExpenseScan } from "@/components/expenses/expense-scan";
import { ExpenseStageSelect } from "@/components/expenses/expense-stage-select";
import { EditExpenseForm, type ExpenseEdit } from "@/components/expenses/edit-expense-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { kindLabel, expenseStage } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

type StatusOpt = { key: string; label: string };

export type ExpenseItem = {
  id: string;
  title: string;
  kind: string;
  categoryLabel: string;
  dateLabel: string;
  vendorName: string | null;
  hours: number | null;
  rate: number | null;
  amount: number;
  currency: string;
  stage: string | null;
  status: string;
  paid: boolean;
  exported: boolean;
  dueLabel: string | null;
  overdue: boolean;
  hasBank: boolean;
  docs: { id: string; originalName: string }[];
  createdByLabel: string;
  edit: ExpenseEdit;
};

export function ExpenseList({
  projectId,
  isOwner,
  canAdd,
  expenses,
  statuses,
  vendors,
  categories,
  subProjects,
  docTypes,
}: {
  projectId: string;
  isOwner: boolean;
  canAdd: boolean;
  expenses: ExpenseItem[];
  statuses: StatusOpt[];
  vendors: { id: string; name: string; hourlyRate: number | null }[];
  categories: { key: string; label: string }[];
  subProjects: { id: string; name: string }[];
  docTypes: { value: string; label: string }[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState("");
  const [pending, setPending] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const router = useRouter();

  const stageLabel = (k: string) => statuses.find((s) => s.key === k)?.label ?? k;
  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allChecked = expenses.length > 0 && sel.size === expenses.length;
  const toggleAll = () =>
    setSel(allChecked ? new Set() : new Set(expenses.map((e) => e.id)));

  async function runBulk(op: string) {
    if (sel.size === 0) return;
    if (op === "delete" && !window.confirm(`Smazat ${sel.size} výdajů?`)) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("op", op);
      fd.set("ids", Array.from(sel).join(","));
      if (op === "stage") fd.set("stage", stage);
      await bulkUpdateExpenses(fd);
      setSel(new Set());
      router.refresh(); // promítnout hromadnou změnu (stav/uhrazeno…) do seznamu
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Hromadná změna selhala.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {isOwner && (
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-stone-200 pb-2">
          <label className="flex items-center gap-2 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="size-4 accent-stone-950"
            />
            {sel.size > 0 ? `${sel.size} vybráno` : "Vybrat vše"}
          </label>

          {sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="h-8 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
              >
                <option value="">— stav —</option>
                {statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending}
                onClick={() => runBulk("stage")}
                className="h-8 border border-stone-300 px-2 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                Nastavit stav
              </button>
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                className="flex h-8 items-center gap-1 border border-stone-300 px-2 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white cursor-pointer"
                title="Sdružená QR platba vybraných neuhrazených výdajů"
              >
                <QrCode className="size-3.5" />
                QR platba
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => runBulk("paid")}
                className="h-8 border border-stone-300 px-2 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                Uhrazeno
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => runBulk("unpaid")}
                className="h-8 border border-stone-300 px-2 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                Neuhrazeno
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => runBulk("delete")}
                className="flex h-8 items-center gap-1 border border-stone-300 px-2 text-xs text-stone-700 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="size-3.5" />
                Smazat
              </button>
              <button
                type="button"
                onClick={() => setSel(new Set())}
                className="text-xs text-stone-400 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer"
              >
                Zrušit výběr
              </button>
            </div>
          )}
        </div>
      )}

      <ul>
        {expenses.map((e) => (
          <li
            key={e.id}
            className={`group flex flex-col gap-2 border-b border-stone-200 py-3.5 sm:flex-row sm:items-baseline sm:gap-3 ${
              sel.has(e.id) ? "bg-stone-50" : ""
            }`}
          >
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              {isOwner && (
                <input
                  type="checkbox"
                  checked={sel.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="mt-1 size-4 shrink-0 accent-stone-950"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-stone-950">
                  <span className="min-w-0 break-words">{e.title}</span>
                  {e.docs.length > 0 && (
                    <Paperclip className="size-3 shrink-0 text-stone-400" />
                  )}
                  {/* Samostatný odznak „exportováno" tu byl vedle stavu a
                      tloukly se. Export teď posouvá stav, takže stačí tečka
                      pro případ, že je výdaj už dál v cyklu (třeba uhrazený). */}
                  {e.exported && (
                    <span
                      title="Vyexportováno do účetnictví"
                      className="shrink-0 text-emerald-600"
                      aria-label="Vyexportováno do účetnictví"
                    >
                      &bull;
                    </span>
                  )}
                  {e.amount < 0 && (
                    <span className="shrink-0 border border-emerald-300 bg-emerald-50 px-1 py-0.5 text-[10px] font-normal uppercase tracking-wide text-emerald-700">
                      příjem
                    </span>
                  )}
                </p>
                <p className="kicker mt-0.5">
                  {kindLabel(e.kind)} · {e.categoryLabel} · {e.dateLabel}
                  {e.vendorName ? ` · ${e.vendorName}` : ""}
                  {e.hours ? ` · ${e.hours} h × ${formatCurrency(e.rate ?? 0, e.currency)}` : ""}
                  {` · zadal ${e.createdByLabel}`}
                </p>
                <PaymentInfo
                  expenseId={e.id}
                  paid={e.paid}
                  dueLabel={e.dueLabel}
                  overdue={e.overdue}
                  hasBank={e.hasBank}
                />
                <ExpenseScan
                  projectId={projectId}
                  expenseId={e.id}
                  docs={e.docs}
                  canAttach={canAdd}
                  types={docTypes}
                />
              </div>
            </div>
            {/* Ovládání: na mobilu samostatný řádek (stav + částka + úpravy), na webu vpravo */}
            <div className="flex shrink-0 items-center gap-2 pl-6 sm:justify-end sm:pl-0">
              {isOwner ? (
                <ExpenseStageSelect
                  projectId={projectId}
                  id={e.id}
                  stage={e.stage}
                  statuses={statuses}
                />
              ) : (
                <span className="border border-stone-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
                  {stageLabel(expenseStage(e.stage))}
                </span>
              )}
              {/* Příjem je uložený se záporným znaménkem – zeleně, ať je
                  v seznamu na první pohled poznat od výdaje. */}
              <span
                className={`ml-auto font-mono text-sm sm:ml-0 ${e.amount < 0 ? "text-emerald-700" : "text-stone-950"}`}
                title={e.amount < 0 ? "Příjem – v součtu se odečítá" : undefined}
              >
                {formatCurrency(e.amount, e.currency)}
              </span>
              {isOwner && (
                <span className="flex items-center gap-1">
                  <EditExpenseForm
                    expense={e.edit}
                    vendors={vendors}
                    categories={categories}
                    subProjects={subProjects}
                    statuses={statuses}
                  />
                  <DeleteButton
                    action={deleteExpense}
                    fields={{ id: e.id, projectId }}
                    confirm="Smazat tento výdaj?"
                  />
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {qrOpen && (
        <QrAggregateModal
          projectId={projectId}
          ids={Array.from(sel)}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
}
