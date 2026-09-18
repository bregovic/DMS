"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { appendSpecsToRequest, applyExtraction, dismissExtraction, getExtraction } from "@/server/actions/extraction";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof getExtraction>>;

const field =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

/**
 * Návrh z vytěžené nabídky (#33) – kontrola a potvrzení.
 *
 * Nic se nezakládá samo: tady se potvrdí dodavatel (nalezený / nový)
 * a ke kterým žádankám se založí nabídky s jakou cenou.
 */
export function ExtractionDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vendorMode, setVendorMode] = useState<"existing" | "new" | "none">("new");

  useEffect(() => {
    getExtraction(id)
      .then((x) => {
        setD(x);
        setVendorMode(x.matchedVendorId ? "existing" : "new");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Načtení selhalo."));
  }, [id]);

  const r = d?.result;
  const open = (d?.requests ?? []).filter((q) => q.status !== "zruseno");
  const made = d?.madeParts ?? {};
  const pending = (r?.parts ?? []).filter((_, i) => !(i in made)).length;
  const [specReq, setSpecReq] = useState<string>("");
  const [specMsg, setSpecMsg] = useState<string | null>(null);
  const kindLabel = { offer: "Cenová nabídka", technical: "Technický dokument", other: "Dokument" } as const;

  return (
    <Dialog title="Návrh z přílohy – ke kontrole" size="2xl" onClose={onClose}>
      {!d || !r ? (
        <p className="p-5 text-sm text-stone-500">{err ?? "Načítám…"}</p>
      ) : (
        <form
          action={async (fd) => {
            setBusy(true);
            setErr(null);
            try {
              await applyExtraction(fd);
              onClose();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Uložení selhalo.");
            }
            setBusy(false);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="id" value={d.id} />
          <p className="text-xs text-stone-500">
            <span className="mr-1 border border-stone-300 px-1 py-px text-[10px] uppercase tracking-wide">
              {kindLabel[r.documentKind ?? "offer"]}
            </span>
            {d.fileName}
            {r.offerNumber ? ` · ${r.offerNumber}` : ""}
            {r.validUntil ? ` · platnost do ${r.validUntil.split("-").reverse().join(".")}` : ""}
            {r.totalWithVat != null ? ` · celkem ${formatCurrency(r.totalWithVat)} s DPH` : ""}
          </p>
          <p className="text-sm text-stone-800">{r.summary}</p>
          {r.warnings.length > 0 && (
            <ul className="space-y-1 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {r.warnings.map((w, i) => (
                <li key={i} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          {(r.technicalSpecs ?? []).length > 0 && (
            <div className="space-y-2 border border-stone-200 p-3">
              <p className="kicker">Technické údaje</p>
              <ul className="list-disc pl-5 text-xs text-stone-700">
                {r.technicalSpecs.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={specReq || d.requestId}
                  onChange={(e) => setSpecReq(e.target.value)}
                  className={`${field} h-9 max-w-xs`}
                  aria-label="Žádanka pro specifikaci"
                >
                  {open.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const fd = new FormData();
                    fd.set("id", d.id);
                    fd.set("requestId", specReq || d.requestId);
                    try {
                      await appendSpecsToRequest(fd);
                      setSpecMsg("Doplněno do specifikace žádanky.");
                    } catch (e) {
                      setSpecMsg(e instanceof Error ? e.message : "Nepodařilo se.");
                    }
                  }}
                >
                  Doplnit do specifikace
                </Button>
                {specMsg && <span className="text-xs text-stone-600">{specMsg}</span>}
              </div>
            </div>
          )}

          {pending > 0 && (
          <>
          {/* Dodavatel */}
          <fieldset className="space-y-2">
            <legend className="kicker mb-1">Dodavatel</legend>
            <input type="hidden" name="vendorMode" value={vendorMode} />
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  ["existing", "Existující"],
                  ["new", "Založit nového"],
                  ["none", "Jen jménem"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setVendorMode(k)}
                  className={`cursor-pointer border px-2.5 py-1 ${
                    vendorMode === k ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-600 hover:border-stone-950"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {vendorMode === "existing" && (
              <select name="vendorId" defaultValue={d.matchedVendorId ?? ""} className={field}>
                <option value="">— vyber —</option>
                {d.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
            {vendorMode === "new" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="vendorName" defaultValue={r.vendor.name ?? ""} placeholder="Název" className={field} required />
                <input name="vendorEmail" type="email" defaultValue={r.vendor.email ?? ""} placeholder="E-mail" className={field} required />
                <input name="vendorIco" defaultValue={r.vendor.ico ?? ""} placeholder="IČO" className={field} />
                <input name="vendorPhone" defaultValue={r.vendor.phone ?? ""} placeholder="Telefon" className={field} />
                <p className="text-[11px] text-stone-400 sm:col-span-2">
                  {[r.vendor.address, r.vendor.contactPerson && `kontakt ${r.vendor.contactPerson}`, r.vendor.web].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}
            {vendorMode === "none" && (
              <p className="text-xs text-stone-500">Nabídky se založí se jménem „{r.vendor.name}“ bez karty dodavatele.</p>
            )}
          </fieldset>

          </>
          )}

          {/* Části nabídky */}
          <fieldset className="space-y-3">
            <legend className="kicker mb-1">
              Nabídky k žádankám · {r.parts.length}
              {r.parts.length === 0 ? " – dokument neobsahuje ceny" : ""}
            </legend>
            {r.parts.map((p, i) =>
              i in made ? (
                <div key={i} className="border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-stone-700">
                  ✓ {p.label} – nabídka založena u žádanky <b>{made[i]}</b>
                </div>
              ) : (
              <div key={i} className="space-y-2 border border-stone-200 p-3">
                <label className="flex items-start gap-2 text-sm font-medium text-stone-950">
                  <input
                    type="checkbox"
                    name={`use_${i}`}
                    value="1"
                    defaultChecked={!!p.requestId}
                    className="mt-0.5 size-4 shrink-0 accent-stone-900"
                  />
                  {p.label}
                </label>
                {p.items.length > 1 && (
                  <ul className="ml-6 list-disc pl-4 text-xs text-stone-600">
                    {p.items.map((x, k) => (
                      <li key={k}>{x}</li>
                    ))}
                  </ul>
                )}
                <div className="ml-6 grid gap-2 sm:grid-cols-[1fr_10rem]">
                  <select name={`req_${i}`} defaultValue={p.requestId ?? ""} className={field} aria-label="Žádanka">
                    <option value="">— k žádné žádance —</option>
                    {open.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title}
                      </option>
                    ))}
                  </select>
                  <input
                    name={`price_${i}`}
                    inputMode="decimal"
                    defaultValue={p.priceWithVat ?? p.priceWithoutVat ?? ""}
                    aria-label="Cena s DPH"
                    className={field}
                  />
                </div>
                <p className="ml-6 text-[11px] text-stone-500">
                  {[
                    p.priceWithoutVat != null && `bez DPH ${formatCurrency(p.priceWithoutVat)}`,
                    p.priceWithVat != null && `s DPH ${formatCurrency(p.priceWithVat)}`,
                    p.leadTime && `dodání ${p.leadTime}`,
                    p.note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {(p.tasks ?? []).length > 0 && (
                  <p className="ml-6 text-[11px] text-stone-500">
                    Po výběru nabídky do plánu: {p.tasks.map((t) => `${t.title} (${t.days} d)`).join(" → ")}
                  </p>
                )}
              </div>
              ),
            )}
          </fieldset>

          {err && <p className="text-sm text-red-600">{err}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const fd = new FormData();
                fd.set("id", d.id);
                await dismissExtraction(fd);
                onClose();
              }}
            >
              Zamítnout
            </Button>
            {pending > 0 && (
              <Button type="submit" disabled={busy}>
                {busy ? "Zakládám…" : "Založit nabídky"}
              </Button>
            )}
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
