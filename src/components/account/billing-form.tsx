"use client";

import { useState } from "react";
import { updateBilling } from "@/server/actions/account";

type B = {
  billingName: string | null;
  billingIco: string | null;
  billingDic: string | null;
  billingAddress: string | null;
  billingAccount: string | null;
  vatPayer: boolean;
};

const field =
  "mt-1 flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none";

/** Fakturační údaje – použijí se na faktuře za vykázanou práci. */
export function BillingForm({ b }: { b: B }) {
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={async (fd) => {
        await updateBilling(fd);
        setSaved(true);
      }}
      onChange={() => setSaved(false)}
      className="grid max-w-2xl gap-3 sm:grid-cols-2"
    >
      <label className="block text-xs text-stone-500 sm:col-span-2">
        Jméno / firma
        <input name="billingName" defaultValue={b.billingName ?? ""} placeholder="Jan Novák – stavební práce" className={field} />
      </label>
      <label className="block text-xs text-stone-500">
        IČO
        <input name="billingIco" defaultValue={b.billingIco ?? ""} inputMode="numeric" className={field} />
      </label>
      <label className="block text-xs text-stone-500">
        DIČ
        <input name="billingDic" defaultValue={b.billingDic ?? ""} className={field} />
      </label>
      <label className="block text-xs text-stone-500 sm:col-span-2">
        Adresa (sídlo)
        <input name="billingAddress" defaultValue={b.billingAddress ?? ""} placeholder="Ulice 12, 110 00 Praha" className={field} />
      </label>
      <label className="block text-xs text-stone-500">
        Číslo účtu nebo IBAN
        <input name="billingAccount" defaultValue={b.billingAccount ?? ""} placeholder="123456789/0800" className={field} />
      </label>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-stone-700">
        <input type="checkbox" name="vatPayer" value="1" defaultChecked={b.vatPayer} className="size-4 accent-stone-900" />
        Plátce DPH
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="h-9 cursor-pointer bg-stone-950 px-4 text-sm text-white">
          Uložit fakturační údaje
        </button>
        {saved && <span className="text-xs text-emerald-700">Uloženo</span>}
      </div>
    </form>
  );
}
