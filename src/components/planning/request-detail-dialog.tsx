"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Check } from "lucide-react";
import { getRequestDetail, updateRequestDates } from "@/server/actions/procurement";
import { selectOffer } from "@/server/actions/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { ModalBackdrop } from "@/components/app/modal-backdrop";
import { REQUEST_STATUSES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

type Detail = Awaited<ReturnType<typeof getRequestDetail>>;

const fieldClass =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950";

export function RequestDetailDialog({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getRequestDetail(id)
      .then((x) => live && setD(x))
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Načtení selhalo."));
    return () => { live = false; };
  }, [id]);

  async function pick(offerId: string) {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("id", offerId);
      await selectOffer(fd);
      setD(await getRequestDetail(id));
      onSaved?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Výběr selhal.");
    }
    setSaving(false);
  }

  const folderHref = d
    ? `/projects/${d.projectId}${d.subProjectId ? `?sub=${d.subProjectId}` : ""}`
    : "#";

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-xl border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Výběrové řízení</h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-950 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        {err && <p className="p-5 text-sm text-red-600">{err}</p>}
        {!d && !err && <p className="p-5 text-sm text-stone-500">Načítám…</p>}

        {d && (
          <div className="space-y-5 p-5">
            <p className="text-base font-medium text-stone-950">{d.title}</p>

            <form
              action={async (fd) => {
                setSaving(true);
                try { await updateRequestDates(fd); } catch (e) { window.alert(e instanceof Error ? e.message : "Uložení selhalo."); setSaving(false); return; }
                onSaved?.();
                onClose();
              }}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={d.id} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rq-start">Začátek VŘ</Label>
                  <DateInput id="rq-start" name="startDate" defaultValue={d.startDate ?? ""} disabled={!d.canEdit} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rq-req">Rozhodnout do</Label>
                  <DateInput id="rq-req" name="requiredDate" defaultValue={d.requiredDate ?? ""} disabled={!d.canEdit} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rq-status">Stav</Label>
                  <select id="rq-status" name="status" defaultValue={d.status} className={fieldClass} disabled={!d.canEdit}>
                    {REQUEST_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {d.canEdit && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>{saving ? "Ukládám…" : "Uložit termíny"}</Button>
                </div>
              )}
            </form>

            <div className="space-y-1.5 border-t border-stone-200 pt-4">
              <p className="kicker">Nabídky ({d.offers.length})</p>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {d.offers.map((o) => (
                  <div key={o.id} className={`border p-2 text-sm ${o.selected ? "border-stone-900 bg-stone-50" : "border-stone-200"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-medium text-stone-900">
                        {o.selected && <Check className="size-3.5 shrink-0" />}
                        <span className="truncate">{o.vendor}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-stone-700">
                        {o.price != null ? formatCurrency(o.price) : "—"}
                        {o.score != null ? ` · ${o.score} b.` : ""}
                      </span>
                    </div>
                    {o.note && <p className="mt-1 line-clamp-2 text-xs text-stone-500">{o.note}</p>}
                    {d.isOwner && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => pick(o.id)}
                        className="mt-1 text-xs text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {o.selected ? "Zrušit výběr" : "Vybrat tuto nabídku"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-1">
              <Link href={folderHref} className="self-center text-xs text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline">
                Otevřít v projektu →
              </Link>
              <Button type="button" variant="ghost" onClick={onClose}>Zavřít</Button>
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
