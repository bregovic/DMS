"use client";

import { useEffect, useState } from "react";
import { NewExpenseForm } from "@/components/expenses/new-expense-form";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { NewRequestForm } from "@/components/requests/new-request-form";

const LAST_KEY = "dms-last-project";
const LAST_SUB_KEY = "dms-last-subproject";

type Vendor = { id: string; name: string; hourlyRate: number | null };
type Sub = { id: string; name: string };

export function QuickAdd({
  projects,
  subsByProject,
  titlesByProject = {},
  vendors,
  myVendorId,
  categories,
  docTypes,
  expenseStatuses,
  taskStatuses,
}: {
  projects: { id: string; name: string }[];
  subsByProject: Record<string, Sub[]>;
  titlesByProject?: Record<string, string[]>;
  vendors: Vendor[];
  myVendorId?: string;
  categories: { key: string; label: string }[];
  docTypes: { value: string; label: string }[];
  expenseStatuses: { key: string; label: string }[];
  taskStatuses: { key: string; label: string }[];
}) {
  const [pid, setPid] = useState(projects[0]?.id ?? "");
  const [sub, setSub] = useState("");

  // Po načtení použij naposledy zvolený projekt + složku (pokud existují).
  useEffect(() => {
    try {
      const savedP = localStorage.getItem(LAST_KEY);
      const p = savedP && projects.some((x) => x.id === savedP) ? savedP : pid;
      if (p !== pid) setPid(p);
      const savedS = localStorage.getItem(LAST_SUB_KEY);
      if (savedS && (subsByProject[p] ?? []).some((s) => s.id === savedS)) setSub(savedS);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  function chooseProject(id: string) {
    setPid(id);
    setSub("");
    try {
      localStorage.setItem(LAST_KEY, id);
      localStorage.removeItem(LAST_SUB_KEY);
    } catch {}
  }
  function chooseSub(id: string) {
    setSub(id);
    try {
      if (id) localStorage.setItem(LAST_SUB_KEY, id);
      else localStorage.removeItem(LAST_SUB_KEY);
    } catch {}
  }

  if (!projects.length) return null;
  const subs = subsByProject[pid] ?? [];
  const subId = sub || undefined;
  const selectClass =
    "h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm font-medium text-stone-950 focus-visible:outline-none focus-visible:border-stone-950 sm:w-56";

  return (
    <div className="mb-10 border border-stone-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0">
            <p className="kicker mb-1.5">Projekt</p>
            <select value={pid} onChange={(e) => chooseProject(e.target.value)} className={selectClass}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {subs.length > 0 && (
            <div className="min-w-0">
              <p className="kicker mb-1.5">Složka</p>
              <select value={sub} onChange={(e) => chooseSub(e.target.value)} className={selectClass}>
                <option value="">— celý projekt —</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {pid && (
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <NewExpenseForm
              key={`e-${pid}-${sub}`}
              projectId={pid}
              subProjectId={subId}
              vendors={vendors}
              myVendorId={myVendorId}
              titleSuggestions={titlesByProject[pid] ?? []}
              categories={categories}
              docTypes={docTypes}
              statuses={expenseStatuses}
              triggerClassName="w-full justify-center sm:w-auto"
            />
            <NewTaskForm
              key={`t-${pid}-${sub}`}
              projectId={pid}
              subProjectId={subId}
              statuses={taskStatuses}
              phases={[]}
              triggerClassName="h-11 w-full justify-center text-base sm:w-auto"
            />
            <NewRequestForm
              key={`r-${pid}-${sub}`}
              projectId={pid}
              subProjectId={subId}
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
