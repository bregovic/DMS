"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip } from "lucide-react";
import { compressImage } from "@/lib/client-upload";

type Field = { label: string; unit?: string | null; required?: boolean };
type Item = { id: string; title: string; fields: Field[] };

const field =
  "block w-full rounded-none border border-stone-300 bg-white px-3 py-2.5 text-[15px] text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none disabled:bg-stone-100 disabled:text-stone-500";
const label = "kicker mb-1.5 block";

const MAX_FILE = 15 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx";

function parse(v: string) {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return v.trim() && isFinite(n) ? n : null;
}
const fmt = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function FilePick({ name, hint }: { name: string; hint: string }) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <label className="flex cursor-pointer items-center gap-2 border border-dashed border-stone-400 px-3 py-3 text-sm text-stone-600 hover:border-stone-950 hover:text-stone-950">
      <Paperclip className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{files.length ? files.map((f) => f.name).join(", ") : hint}</span>
      <input
        type="file"
        name={name}
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
      />
    </label>
  );
}

/** Jedna nabídka na položku: ceny a DPH, termíny, požadované údaje, příloha. */
type Totals = { on: boolean; base: number | null; gross: number | null };

function ItemOffer({ item, single, n, onTotals }: { item: Item; single: boolean; n: number; onTotals: (t: Totals) => void }) {
  const [on, setOn] = useState(true);
  const [base, setBase] = useState("");
  const [rate, setRate] = useState("21");
  const [gross, setGross] = useState("");
  const rc = rate === "rc";
  useEffect(() => onTotals({ on, base: parse(base), gross: rc ? parse(base) : parse(gross) }), [on, base, gross, rc]); // eslint-disable-line react-hooks/exhaustive-deps

  const recompute = (b: string, r: string) => {
    const n = parse(b);
    if (n == null) return;
    setGross(fmt(r === "rc" ? n : n * (1 + Number(r) / 100)));
  };

  return (
    <div className={`border bg-white ${on ? "border-stone-950" : "border-stone-300/80"}`}>
      <label className={`flex items-center gap-3 px-5 py-4 sm:px-7 ${single ? "" : "cursor-pointer"}`}>
        {!single && (
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-5 accent-stone-950" />
        )}
        <span className={`display flex size-8 shrink-0 items-center justify-center text-sm ${on ? "bg-stone-950 text-white" : "bg-stone-200 text-stone-500"}`}>{n}</span>
        <span className="display text-xl text-stone-950">{item.title}</span>
        {!single && !on && <span className="ml-auto text-xs text-stone-500">bez nabídky</span>}
      </label>
      <input type="hidden" name={`offer_${item.id}`} value={on ? "1" : "0"} />

      {on && (
        <div className="space-y-5 border-t border-stone-200 px-5 py-5 sm:px-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <span className={label}>Cena bez DPH (Kč) *</span>
              <input
                name={`priceWithoutVat_${item.id}`}
                inputMode="decimal"
                className={`${field} font-mono`}
                value={base}
                onChange={(e) => {
                  setBase(e.target.value);
                  recompute(e.target.value, rate);
                }}
              />
            </div>
            <div>
              <span className={label}>DPH</span>
              <select
                name={`vatRate_${item.id}`}
                className={field}
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  recompute(base, e.target.value);
                }}
              >
                <option value="21">21 %</option>
                <option value="12">12 %</option>
                <option value="0">0 % / neplátce DPH</option>
                <option value="rc">Přenesená daňová povinnost</option>
              </select>
            </div>
            <div>
              <span className={label}>{rc ? "Cena celkem (bez DPH)" : "Cena s DPH (Kč)"}</span>
              <input
                name={`price_${item.id}`}
                inputMode="decimal"
                className={`${field} font-mono`}
                value={gross}
                disabled={rc}
                onChange={(e) => setGross(e.target.value)}
              />
            </div>
          </div>
          {rc && <p className="-mt-2 text-xs text-stone-500">Daň přizná odběratel – faktura bez DPH.</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Termín dodání / realizace</span>
              <input type="date" name={`delivery_${item.id}`} className={field} />
            </div>
            <div>
              <span className={label}>Platnost nabídky do</span>
              <input type="date" name={`valid_${item.id}`} className={field} />
            </div>
          </div>

          {item.fields.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {item.fields.map((f, i) => (
                <div key={i}>
                  <span className={label}>
                    {f.label}
                    {f.unit ? ` [${f.unit}]` : ""}
                    {f.required ? " *" : ""}
                  </span>
                  <input name={`param_${item.id}_${i}`} required={f.required} className={field} />
                </div>
              ))}
            </div>
          )}

          <div>
            <span className={label}>Poznámka k položce</span>
            <textarea name={`note_${item.id}`} rows={2} className={field} />
          </div>
          <div>
            <span className={label}>Nabídka k položce v souboru</span>
            <FilePick name={`file_${item.id}`} hint="Přiložit soubor (PDF, obrázek, Word, Excel · do 15 MB)" />
          </div>
        </div>
      )}
    </div>
  );
}

export function PortalOfferForm({
  token,
  items,
  defaults,
  previewOnly = false,
}: {
  token: string;
  items: Item[];
  defaults: { email: string; ico: string; phone: string };
  /** Náhled konceptu pro zadavatele – formulář vidět, odeslat nejde. */
  previewOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [icoState, setIcoState] = useState<"idle" | "loading" | "missing">("idle");
  const [totals, setTotals] = useState<Record<string, Totals>>({});
  const picked = Object.values(totals).filter((x) => x.on && (x.base ?? 0) > 0);
  const sumBase = picked.reduce((a, x) => a + (x.base ?? 0), 0);
  const sumGross = picked.reduce((a, x) => a + (x.gross ?? 0), 0);

  async function lookup(ico: string) {
    const clean = ico.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setIcoState("loading");
    try {
      const res = await fetch(`/api/p/${token}/ares/${clean}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { name: string; address: string | null };
      setCompany(j.name);
      setAddress(j.address);
      setIcoState("idle");
    } catch {
      setIcoState("missing");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (previewOnly) return;
    setError(null);
    const raw = new FormData(e.currentTarget);
    if (!items.some((i) => raw.get(`offer_${i.id}`) === "1"))
      return setError("Vyberte aspoň jednu položku, na kterou podáváte nabídku.");

    setBusy(true);
    // Fotky se před odesláním zmenší (delší strana 2000 px, JPEG) – nezabírají zbytečně místo.
    const fd = new FormData();
    let total = 0;
    for (const [k, v] of raw.entries()) {
      if (v instanceof File) {
        if (!v.size) continue;
        const f = v.type.startsWith("image/") ? await compressImage(v) : v;
        if (f.size > MAX_FILE) {
          setBusy(false);
          return setError(`Soubor „${v.name}“ je větší než 15 MB.`);
        }
        total += f.size;
        fd.append(k, f);
      } else fd.append(k, v);
    }
    if (total > MAX_TOTAL) {
      setBusy(false);
      return setError("Přílohy mají dohromady víc než 40 MB.");
    }

    try {
      const res = await fetch(`/api/p/${token}/submit`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { code?: string | null; error?: string };
      if (!res.ok) throw new Error(j.error || "Nabídku se nepodařilo odeslat.");
      if (j.code) router.push(`/n/${j.code}?nova=1`);
      else setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nabídku se nepodařilo odeslat.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      <div>
        <h2 className="display text-3xl text-stone-950">Podat nabídku</h2>
        {items.length > 1 && (
          <p className="mt-2 text-sm text-stone-600">Položky, na které nabídku nepodáváte, odškrtněte.</p>
        )}
        <div className="mt-5 space-y-3">
          {items.map((i, k) => (
            <ItemOffer
              key={i.id}
              item={i}
              n={k + 1}
              single={items.length === 1}
              onTotals={(x) => setTotals((t) => ({ ...t, [i.id]: x }))}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="kicker mb-3">Dodavatel</h2>
        <div className="space-y-4 border border-stone-300/80 bg-white px-5 py-5 sm:px-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <span className={label}>IČO</span>
              <input
                name="ico"
                inputMode="numeric"
                defaultValue={defaults.ico}
                className={`${field} font-mono`}
                onBlur={(e) => lookup(e.target.value)}
              />
              {icoState === "loading" && <p className="mt-1 text-xs text-stone-500">Hledám v ARES…</p>}
              {icoState === "missing" && <p className="mt-1 text-xs text-amber-700">IČO v ARES nenalezeno.</p>}
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Firma / jméno</span>
              <input name="companyName" value={company} onChange={(e) => setCompany(e.target.value)} className={field} />
              {address && <p className="mt-1 text-xs text-stone-500">{address}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>E-mail *</span>
              <input name="email" type="email" required defaultValue={defaults.email} className={field} />
            </div>
            <div>
              <span className={label}>Telefon</span>
              <input name="phone" type="tel" defaultValue={defaults.phone} className={field} />
            </div>
          </div>
          <div>
            <span className={label}>Zpráva k nabídce</span>
            <textarea name="note" rows={4} className={field} placeholder="Doplňující informace, podmínky, dotazy k zadání…" />
          </div>
          <div>
            <span className={label}>Přílohy k celé nabídce</span>
            <FilePick name="file_all" hint="Cenová nabídka, technické listy, reference… (do 15 MB/soubor)" />
          </div>
          {/* past na roboty */}
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        </div>
      </div>

      {sumBase > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-3 border border-stone-950 bg-white px-5 py-4 sm:px-7">
          <span className="kicker">Celkem za {picked.length} {picked.length === 1 ? "položku" : picked.length < 5 ? "položky" : "položek"}</span>
          <span className="font-mono text-stone-950">
            <b className="text-xl">{fmt(sumBase)} Kč</b> <span className="text-sm text-stone-500">bez DPH</span>
            {sumGross > 0 && sumGross !== sumBase && <span className="ml-3 text-sm text-stone-600">{fmt(sumGross)} Kč s DPH</span>}
          </span>
        </div>
      )}

      {error && <p className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {previewOnly ? (
        <p className="border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Náhled – odeslat nabídku půjde, až řízení v DMS zveřejníte.
        </p>
      ) : (
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 bg-stone-950 px-6 py-4 text-base font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60 cursor-pointer sm:w-auto"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Odesílám…" : "Odeslat nabídku"}
        </button>
      )}
    </form>
  );
}
