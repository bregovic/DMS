"use client";

import { useState } from "react";
import { updateBilling } from "@/server/actions/account";
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
            <input name="billingName" defaultValue={b.billingName ?? ""} placeholder="Jan Novák – stavební práce" className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            IČO
            <input name="billingIco" defaultValue={b.billingIco ?? ""} inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            DIČ
            <input name="billingDic" defaultValue={b.billingDic ?? ""} placeholder="CZ12345678" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Číslo účtu nebo IBAN
            <input name="billingAccount" defaultValue={b.billingAccount ?? ""} placeholder="123456789/0800" className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid>
          <label className={lab}>
            Adresa na faktuře
            <input name="billingAddress" defaultValue={b.billingAddress ?? ""} placeholder="Ulice 12, 110 00 Praha" className={`${field} mt-1`} />
          </label>
          <label className="flex h-10 items-center gap-2 self-end text-sm text-stone-700">
            <input type="checkbox" name="vatPayer" value="1" defaultChecked={b.vatPayer} className="size-4 accent-stone-900" />
            Plátce DPH
          </label>
        </FormGrid>
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
                <input name="firstName" defaultValue={b.firstName ?? ""} className={`${field} mt-1`} />
              </label>
              <label className={lab}>
                Příjmení
                <input name="lastName" defaultValue={b.lastName ?? ""} className={`${field} mt-1`} />
              </label>
            </>
          )}
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Ulice
            <input name="street" defaultValue={b.street ?? ""} className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Číslo popisné
            <input name="houseNo" defaultValue={b.houseNo ?? ""} className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Číslo orientační
            <input name="orientNo" defaultValue={b.orientNo ?? ""} className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Obec
            <input name="city" defaultValue={b.city ?? ""} className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            PSČ
            <input name="zip" defaultValue={b.zip ?? ""} inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Stát
            <input name="country" defaultValue={b.country ?? "ČESKÁ REPUBLIKA"} className={`${field} mt-1`} />
          </label>
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Telefon
            <input name="phone" defaultValue={b.phone ?? ""} inputMode="tel" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            ID datové schránky
            <input name="dataBoxId" defaultValue={b.dataBoxId ?? ""} className={`${field} mt-1`} />
          </label>
          <span />
        </FormGrid>
        <FormGrid cols={3}>
          <label className={lab}>
            Kód finančního úřadu
            <input name="taxOfficeCode" defaultValue={b.taxOfficeCode ?? ""} placeholder="např. 001" inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <label className={lab}>
            Územní pracoviště
            <input name="taxOfficeBranch" defaultValue={b.taxOfficeBranch ?? ""} placeholder="např. 2001" inputMode="numeric" className={`${field} mt-1`} />
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
