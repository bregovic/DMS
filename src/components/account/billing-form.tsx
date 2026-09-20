"use client";

import { useState } from "react";
import { Search, Landmark, Loader2 } from "lucide-react";
import { lookupVatAccounts, updateBilling } from "@/server/actions/account";
import { FormGrid, FormSection } from "@/components/ui/form-section";

export type BillingValues = {
  billingName: string | null;
  billingIco: string | null;
  billingDic: string | null;
  billingAddress: string | null;
  billingAccount: string | null;
  vatPayer: boolean;
  taxSubjectType: string | null;
  firstName: string | null;
  lastName: string | null;
  street: string | null;
  houseNo: string | null;
  orientNo: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  dataBoxId: string | null;
  taxOfficeCode: string | null;
  taxOfficeBranch: string | null;
};

const field =
  "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";
const lab = "kicker block !text-stone-500";

/**
 * Fakturační a daňové údaje: na fakturu za vykázanou práci a do XML
 * kontrolního hlášení (typ subjektu, rozepsaná adresa, kontakt, FÚ).
 */
export function BillingForm({ b }: { b: BillingValues }) {
  const [saved, setSaved] = useState(false);
  const [po, setPo] = useState(b.taxSubjectType === "PO");
  const [v, setV] = useState<Record<string, string>>({
    billingName: b.billingName ?? "",
    billingIco: b.billingIco ?? "",
    billingDic: b.billingDic ?? "",
    billingAddress: b.billingAddress ?? "",
    billingAccount: b.billingAccount ?? "",
    firstName: b.firstName ?? "",
    lastName: b.lastName ?? "",
    street: b.street ?? "",
    houseNo: b.houseNo ?? "",
    orientNo: b.orientNo ?? "",
    city: b.city ?? "",
    zip: b.zip ?? "",
    country: b.country ?? "ČESKÁ REPUBLIKA",
    phone: b.phone ?? "",
    dataBoxId: b.dataBoxId ?? "",
    taxOfficeCode: b.taxOfficeCode ?? "",
    taxOfficeBranch: b.taxOfficeBranch ?? "",
  });
  const set = (k: string, x: string) => {
    setV((o) => ({ ...o, [k]: x }));
    setSaved(false);
  };
  const [busy, setBusy] = useState<"ares" | "dph" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{ display: string; published: string | null }[] | null>(null);

  /** Z IČO doplní název, DIČ a rozepsanou adresu z ARESu. */
  async function fromAres() {
    const ico = v.billingIco.replace(/\D/g, "");
    if (!ico) return setMsg("Zadej IČO.");
    setBusy("ares");
    setMsg(null);
    try {
      const r = await fetch(`/api/ares/${ico}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Subjekt se nepodařilo načíst.");
      setV((o) => ({
        ...o,
        billingName: d.name ?? o.billingName,
        billingDic: d.dic ?? o.billingDic,
        billingAddress: d.address ?? o.billingAddress,
        street: d.street ?? o.street,
        houseNo: d.houseNo ?? o.houseNo,
        orientNo: d.orientNo ?? o.orientNo,
        city: d.city ?? o.city,
        zip: d.zip ?? o.zip,
        country: d.country ?? o.country,
      }));
      if (d.subjectType) setPo(d.subjectType === "PO");
      setMsg(`Načteno z ARESu: ${d.name ?? ico}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "ARES nedostupný.");
    }
    setBusy(null);
  }

  /** Zveřejněné účty z registru plátců DPH (ty patří na fakturu). */
  async function fromVatRegistry() {
    if (!v.billingDic) return setMsg("Zadej DIČ.");
    setBusy("dph");
    setMsg(null);
    try {
      const r = await lookupVatAccounts(v.billingDic);
      if (!r.found) setMsg("V registru plátců DPH jsem subjekt nenašel – nejspíš nejsi plátce.");
      else {
        setAccounts(r.accounts);
        setMsg(
          r.accounts.length
            ? `Nalezeno ${r.accounts.length} zveřejněných účtů${r.unreliable ? " · pozor: evidován jako nespolehlivý plátce" : ""}`
            : "Plátce nalezen, ale nemá zveřejněný žádný účet.",
        );
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Registr nedostupný.");
    }
    setBusy(null);
  }

  return (
    <form
      action={async (fd) => {
        await updateBilling(fd);
        setSaved(true);
      }}
      onChange={() => setSaved(false)}
      className="max-w-3xl space-y-5"
    >
      <FormSection title="Fakturace" hint="použije se na faktuře a v žádosti o úhradu">
        <FormGrid>
          <label className={`${lab} sm:col-span-2`}>
            Jméno / firma
            <input name="billingName" value={v.billingName ?? ""} onChange={(e) => set("billingName", e.target.value)} placeholder="Jan Novák – stavební práce" className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            IČO
            <input name="billingIco" value={v.billingIco ?? ""} onChange={(e) => set("billingIco", e.target.value)} inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            DIČ
            <input name="billingDic" value={v.billingDic ?? ""} onChange={(e) => set("billingDic", e.target.value)} placeholder="CZ12345678" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Číslo účtu nebo IBAN
            <input name="billingAccount" value={v.billingAccount ?? ""} onChange={(e) => set("billingAccount", e.target.value)} placeholder="123456789/0800" className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid>
          <label className={lab}>
            Adresa na faktuře
            <input name="billingAddress" value={v.billingAddress ?? ""} onChange={(e) => set("billingAddress", e.target.value)} placeholder="Ulice 12, 110 00 Praha" className={`${field} mt-1`} />
          </label>
          <label className="flex h-10 items-center gap-2 self-end text-sm text-stone-700">
            <input type="checkbox" name="vatPayer" value="1" defaultChecked={b.vatPayer} className="size-4 accent-stone-900" />
            Plátce DPH
          </label>
        </FormGrid>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fromAres}
            disabled={busy !== null}
            className="flex h-9 cursor-pointer items-center gap-1.5 border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-50"
          >
            {busy === "ares" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Načíst z ARESu podle IČO
          </button>
          <button
            type="button"
            onClick={fromVatRegistry}
            disabled={busy !== null}
            className="flex h-9 cursor-pointer items-center gap-1.5 border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-50"
          >
            {busy === "dph" ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />} Účty z registru plátců DPH
          </button>
          {msg && <span className="text-xs text-stone-600">{msg}</span>}
        </div>
        {accounts && accounts.length > 0 && (
          <ul className="border border-stone-200 text-sm">
            {accounts.map((a) => (
              <li key={a.display} className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-3 py-2 last:border-0">
                <span className="font-mono text-stone-950">{a.display}</span>
                {a.published && <span className="text-[11px] text-stone-400">zveřejněn {a.published}</span>}
                <button
                  type="button"
                  onClick={() => set("billingAccount", a.display)}
                  className="ml-auto cursor-pointer border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:border-stone-950"
                >
                  Použít
                </button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection
        title="Daňová podání"
        hint="pro XML kontrolního hlášení – vyplň, jen pokud jsi plátce DPH a podáváš sám"
      >
        <FormGrid cols={3}>
          <label className={lab}>
            Typ subjektu
            <select
              name="taxSubjectType"
              defaultValue={b.taxSubjectType ?? "FO"}
              onChange={(e) => setPo(e.target.value === "PO")}
              className={`${field} mt-1`}
            >
              <option value="FO">Fyzická osoba</option>
              <option value="PO">Právnická osoba</option>
            </select>
          </label>
          {!po && (
            <>
              <label className={lab}>
                Jméno
                <input name="firstName" value={v.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className={lab}>
                Příjmení
                <input name="lastName" value={v.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} className={`${field} mt-1`} />
              </label>
            </>
          )}
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Ulice
            <input name="street" value={v.street ?? ""} onChange={(e) => set("street", e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Číslo popisné
            <input name="houseNo" value={v.houseNo ?? ""} onChange={(e) => set("houseNo", e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Číslo orientační
            <input name="orientNo" value={v.orientNo ?? ""} onChange={(e) => set("orientNo", e.target.value)} className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Obec
            <input name="city" value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            PSČ
            <input name="zip" value={v.zip ?? ""} onChange={(e) => set("zip", e.target.value)} inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Stát
            <input name="country" value={v.country ?? ""} onChange={(e) => set("country", e.target.value)} className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Telefon
            <input name="phone" value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} inputMode="tel" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            ID datové schránky
            <input name="dataBoxId" value={v.dataBoxId ?? ""} onChange={(e) => set("dataBoxId", e.target.value)} className={`${field} mt-1`} />
          </label>
          <span />
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Kód finančního úřadu
            <input name="taxOfficeCode" value={v.taxOfficeCode ?? ""} onChange={(e) => set("taxOfficeCode", e.target.value)} placeholder="např. 001" inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Územní pracoviště
            <input name="taxOfficeBranch" value={v.taxOfficeBranch ?? ""} onChange={(e) => set("taxOfficeBranch", e.target.value)} placeholder="např. 2001" inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <p className="self-end pb-1 text-[11px] text-stone-400">
            Kódy najdeš na portálu MOJE daně u svého úřadu; bez nich soubor kontrolního hlášení neprojde.
          </p>
        </FormGrid>
      </FormSection>

      <div className="flex items-center gap-3">
        <button type="submit" className="h-10 cursor-pointer bg-stone-950 px-4 text-sm text-white transition-colors hover:bg-stone-800">
          Uložit údaje
        </button>
        {saved && <span className="text-xs text-emerald-700">Uloženo</span>}
      </div>
    </form>
  );
}
