"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { startCostReport } from "@/server/actions/cost-report";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { chybaAkce } from "@/lib/chyba-akce";

/** Tlačítko „Report nákladů“ u souhrnu výdajů a forecastu (#48). */
export function CostReportButton({
  projectId,
  subProjectId,
}: {
  projectId: string;
  subProjectId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border border-stone-300 px-4 py-2.5 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white cursor-pointer sm:py-0"
      >
        <Plus className="size-4" />
        Nový report
      </button>
      {open && (
        <Dialog title="Nový report nákladů" size="md" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              try {
                const res = await startCostReport(fd);
                router.push(`/report/${res.id}`);
              } catch (e) {
                window.alert(chybaAkce(e, "Report se nepodařilo spustit."));
                setBusy(false);
              }
            }}
            className="space-y-4 p-5"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="subProjectId" value={subProjectId ?? ""} />
            <div className="space-y-1.5">
              <Label htmlFor="cr-prompt">Upřesnění (nepovinné)</Label>
              <textarea
                id="cr-prompt"
                name="prompt"
                rows={4}
                placeholder="Např. denní sazby dodavatelů, plochy (fasáda, střecha), co v plánu chybí"
                className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Spouštím…" : "Vytvořit report"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
