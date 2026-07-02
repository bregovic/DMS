"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { exportProjectExpenses } from "@/server/actions/export-expenses";

export function ExportExpensesButton({
  projectId,
  ids,
}: {
  projectId: string;
  ids: string[];
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function run() {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      const res = await exportProjectExpenses(projectId, ids);
      if ("error" in res) {
        window.alert(res.error);
        return;
      }
      const bytes = Uint8Array.from(atob(res.data), (ch) => ch.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "text/csv;charset=windows-1250",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      router.refresh(); // ukáže odznaky „exportováno"
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Export selhal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || ids.length === 0}
      title="Vyexportovat aktuálně zobrazené výdaje do CSV a označit je jako exportované"
      className="flex h-8 items-center gap-1.5 border border-stone-300 px-2.5 text-xs text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-40 cursor-pointer"
    >
      <Download className="size-3.5" />
      {busy ? "Exportuji…" : `Export CSV${ids.length ? ` (${ids.length})` : ""}`}
    </button>
  );
}
