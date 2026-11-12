"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip } from "lucide-react";

type Field = { label: string; unit?: string | null; required?: boolean };
type Item = { id: string; title: string; fields: Field[] };

const field =
  "block w-full rounded-none border border-stone-300 bg-white px-3 py-2.5 text-[15px] text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none";
const label = "kicker mb-1.5 block";

const MAX_FILE = 15 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx";

function parse(v: string) {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return v.trim() && isFinite(n) ? n : null;
}
const fmt = (n: number) =>
  n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Jedna nabídka na položku: ceny, termíny, požadované údaje, příloha. */
function ItemOffer({ item, single }: { item: Item; single: boolean }) {
  const [on, setOn] = useState(single);
  const [base, setBase] = useState("");
  const [rate, setRate] = useState("21");
  const [gross, setGross] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const recompute = (b: string, r: string) => {
    const n = parse(b);
    if (n != null && r !== "") setGross(fmt(n * (1 + Number(r) / 100)));
  };

  return (
    <div className={`border bg-white ${on ? "border-stone-950" : "border-stone-300/80"}`}>
      <label className={`flex items-center gap-3 px-5 py-4 sm:px-7 ${single ? "" : "cursor-pointer"}`}>
        {!single && (
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            className="size-5 accent-stone-950"
          />
        )}
        <span className="display text-xl text-stone-950">{item.title}</span>
      </label>
      <input type="hidden" name={`offer_${item.id}`} value={on ? "1" : "0"} />

      {on && (
        <div className="space-y-5 border-t border-stone-200 px-5 py-5 sm:px-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <span className={label}>Cena bez DPH (Kč)</span>
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
              <span className={label}>Sazba DPH</span>
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
                <option value="0">0 % / neplátce</option>
              </select>
            </div>
            <div>
              <span className={label}>Cena s DPH (Kč)</span>
              <input
                name={`price_${item.id}`}
                inputMode="decimal"
                className={`${field} font-mono`}
                value={gross}
                onChange={(e) => setGross(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Termín dodání</span>
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
            <textarea name={`note_${item.id}`} rows={3} className={field} />
          </div>

          <div>
            <span className={label}>Nabídka v souboru</span>
            <label className="flex cursor-pointer items-center gap-2 border border-dashed border-stone-400 px-3 py-3 text-sm text-stone-600 hover:border-stone-950 hover:text-stone-950">
              <Paperclip className="size-4" />
              {files.length ? files.map((f) => f.name).join(", ") : "Přiložit soubor (PDF, obrázek, Word, Excel · do 15 MB)"}
              <input
                type="file"
                name={`file_${item.id}`}
                accept={ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
              />
            </label>
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
}: {
  token: string;
  items: Item[];
  defaults: { email: string; ico: string; phone: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [icoState, setIcoState] = useState<"idle" | "loading" | "missing">("idle");

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
    setError(null);
    const fd = new FormData(e.currentTarget);
    let total = 0;
    for (const [, v] of fd.entries()) {
      if (v instanceof File) {
        if (v.size > MAX_FILE) return setError(`Soubor „${v.name}“ je větší než 15 MB.`);
        total += v.size;
      }
    }
    if (total > MAX_TOTAL) return setError("Přílohy mají dohromady víc než 40 MB.");
    if (!items.some((i) => fd.get(`offer_${i.id}`) === "1"))
      return setError("Vyberte aspoň jednu položku, na kterou podáváte nabídku.");

    setBusy(true);
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
          <p className="mt-2 text-sm text-stone-600">Nabídku lze podat na všechny položky nebo jen na některé.</p>
        )}
        <div className="mt-5 space-y-3">
          {items.map((i) => (
            <ItemOffer key={i.id} item={i} single={items.length === 1} />
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
            <span className={label}>Poznámka k nabídce</span>
            <textarea name="note" rows={3} className={field} />
          </div>
          {/* past na roboty */}
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        </div>
      </div>

      {error && <p className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 bg-stone-950 px-6 py-4 text-base font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60 cursor-pointer sm:w-auto"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? "Odesílám…" : "Odeslat nabídku"}
      </button>
    </form>
  );
}
