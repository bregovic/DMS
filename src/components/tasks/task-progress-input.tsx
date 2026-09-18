"use client";

import { useState, useTransition } from "react";
import { setMyTaskProgress } from "@/server/actions/my-tasks";

/** Hotovo % přímo v řádku (Moje úkoly) – uloží se po opuštění pole / Enter. */
export function TaskProgressInput({ taskId, percent }: { taskId: string; percent: number }) {
  const [v, setV] = useState(String(percent || 0));
  const [pending, start] = useTransition();
  const save = () => {
    const n = Math.max(0, Math.min(100, Math.round(Number(v.replace(",", ".")) || 0)));
    if (n === (percent || 0)) return;
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("percent", String(n));
    start(async () => {
      try {
        await setMyTaskProgress(fd);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Uložení se nepodařilo.");
      }
    });
  };
  return (
    <label className="flex items-center gap-1 text-xs text-stone-500">
      <input
        value={v}
        inputMode="numeric"
        disabled={pending}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        aria-label="Hotovo %"
        className="h-7 w-12 rounded-none border border-stone-300 bg-white px-1.5 text-right text-base text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none sm:text-xs"
      />
      %
    </label>
  );
}
