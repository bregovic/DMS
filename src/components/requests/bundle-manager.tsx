"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { createBundle, setRequestsBundle } from "@/server/actions/bundles";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sdružení žádanek do poptávkového balíčku (#40): okna, dveře a portál se
 * poptávají zvlášť, ale rozhoduje se o nich společně. Jeden dialog umí
 * založit nový balíček, přidat žádanky do stávajícího i vyřadit je z něj.
 */
export function BundleManager({
  projectId,
  requests,
  bundles,
}: {
  projectId: string;
  requests: { id: string; title: string; bundleId: string | null }[];
  bundles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("new");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (requests.length === 0) return null;
  const bundleName = (id: string | null) => bundles.find((b) => b.id === id)?.name;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:border-stone-950"
      >
        <Layers className="size-3.5" />
        Sdružit do balíčku
      </button>

      {open && (
        <Dialog title="Poptávkový balíček" size="md" onClose={() => setOpen(false)}>
          <form
            action={async (fd) => {
              setBusy(true);
              setErr(null);
              try {
                if (target === "new") await createBundle(fd);
                else await setRequestsBundle(fd);
                setOpen(false);
                router.refresh();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Nepodařilo se uložit.");
              }
              setBusy(false);
            }}
            className="space-y-4 p-5"
          >
            <input type="hidden" name="projectId" value={projectId} />

            <div className="space-y-1.5">
              <Label htmlFor="bm-target">Kam</Label>
              <select
                id="bm-target"
                name="bundleId"
                value={target === "new" ? "" : target}
                onChange={(e) => setTarget(e.target.value || "none")}
                className="flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none"
              >
                <option value="">— vyřadit z balíčku —</option>
                {bundles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-stone-700">
                <input
                  type="radio"
                  checked={target === "new"}
                  onChange={() => setTarget("new")}
                  className="size-4 cursor-pointer accent-stone-900"
                />
                Založit nový balíček
              </label>
            </div>

            {target === "new" && (
              <div className="space-y-1.5">
                <Label htmlFor="bm-name">Název balíčku</Label>
                <Input id="bm-name" name="name" placeholder="Např. Výplně otvorů" autoFocus required />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Žádanky</Label>
              <ul className="max-h-64 overflow-y-auto border border-stone-200">
                {requests.map((r) => (
                  <li key={r.id} className="border-b border-stone-100 last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-stone-900">
                      <input
                        type="checkbox"
                        name="requestIds"
                        value={r.id}
                        className="size-4 shrink-0 cursor-pointer accent-stone-900"
                      />
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      {r.bundleId && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone-400">
                          {bundleName(r.bundleId) ?? "v balíčku"}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-stone-400">
                Žádanka patří vždy jen do jednoho balíčku – zařazením do jiného se z původního vyřadí.
              </p>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Ukládám…" : "Uložit"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
