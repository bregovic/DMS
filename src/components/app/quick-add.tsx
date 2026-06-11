"use client";

import { useEffect, useState } from "react";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { NewRequestForm } from "@/components/requests/new-request-form";

const LAST_KEY = "dms-last-project";

type Vendor = { id: string; name: string; hourlyRate: number | null };

export function QuickAdd({
  projects,
  vendors,
  categories,
  docTypes,
  expenseStatuses,
  taskStatuses,
}: {
  projects: { id: string; name: string }[];
  vendors: Vendor[];
  categories: { key: string; label: string }[];
  docTypes: { value: string; label: string }[];
  expenseStatuses: { key: string; label: string }[];
  taskStatuses: { key: string; label: string }[];
}) {
  const [pid, setPid] = useState(projects[0]?.id ?? "");

  // Po načtení použij naposledy zvolený projekt (pokud existuje).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_KEY);
      if (saved && projects.some((p) => p.id === saved)) setPid(saved);
    } catch {}
  }, [projects]);

  function choose(id: string) {
    setPid(id);
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {}
  }

  if (!projects.length) return null;

  return (
    <div className="mb-10 border border-stone-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="kicker mb-1.5">Rychlé přidání do projektu</p>
          <select
            value={pid}
            onChange={(e) => choose(e.target.value)}
            className="h-10 w-full max-w-xs rounded-none border border-stone-300 bg-white px-3 text-sm font-medium text-stone-950 focus-visible:outline-none focus-visible:border-stone-950 sm:w-64"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {pid && (
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <NewExpenseForm
              key={`e-${pid}`}
              projectId={pid}
              vendors={vendors}
              categories={categories}
              docTypes={docTypes}
              statuses={expenseStatuses}
              triggerClassName="w-full justify-center sm:w-auto"
            />
            <NewTaskForm
              key={`t-${pid}`}
              projectId={pid}
              statuses={taskStatuses}
              phases={[]}
              triggerClassName="h-11 w-full justify-center text-base sm:w-auto"
            />
            <NewRequestForm
              key={`r-${pid}`}
              projectId={pid}
              vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
              categories={categories}
              triggerClassName="h-11 w-full justify-center text-base sm:w-auto"
            />
          </div>
        )}
      </div>
    </div>
  );
}
