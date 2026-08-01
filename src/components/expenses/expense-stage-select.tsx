"use client";

import { setExpenseStage } from "@/server/actions/expenses";
import { expenseStage } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

export function ExpenseStageSelect({
  projectId,
  id,
  stage,
  statuses,
}: {
  projectId: string;
  id: string;
  stage: string | null;
  statuses: { key: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <form action={setExpenseStage}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="id" value={id} />
      <select
        name="stage"
        // key: po přepočtu na serveru vzít novou hodnotu, jinak by select
        // zůstal viset na tom, co uživatel klikl, i kdyby akce neprošla
        key={expenseStage(stage)}
        defaultValue={expenseStage(stage)}
        onChange={(e) => {
          e.currentTarget.form?.requestSubmit();
          // přehled i součty nad seznamem se musí přepočítat, ne jen řádek
          startTransition(() => router.refresh());
        }}
        className="h-7 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
      >
        {statuses.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}
