"use client";

import { setExpenseStage } from "@/server/actions/expenses";

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
  return (
    <form action={setExpenseStage}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="id" value={id} />
      <select
        name="stage"
        defaultValue={stage ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-7 rounded-none border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus-visible:outline-none focus-visible:border-stone-950"
      >
        <option value="">— stav —</option>
        {statuses.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}
