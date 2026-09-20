import { prisma } from "@/lib/prisma";
import { managedProjectIds } from "@/server/access";
import { amountCzk, vatRowsCzk } from "@/lib/vat";

/**
 * XML kontrolního hlášení (písemnost DPHKH1) pro portál MOJE daně.
 *
 * Skládá se z dokladů, které jsou v aplikaci vytěžené a označené „zahrnout
 * do podkladu pro DPH“: doklady od 10 000 Kč s DIČ dodavatele jdou do
 * oddílu B.2 jednotlivě, zbytek do B.3 souhrnně. Sazby: 1 = základní 21 %,
 * 2 = snížená 12 %, 3 = ostatní (starší doklady s 10/15 %).
 *
 * Je to podklad, ne podání: soubor se načte na portálu (Elektronická
 * podání → Načíst soubor), kde projde kontrolou a doplní se, co chybí.
 */

export type KhPeriod = { year: number; month?: number; quarter?: number };

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attr = (o: Record<string, string | number | null | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(" ");
const czDate = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join(".");
const amount = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
/** Doklad se do KH uvádí jednotlivě od 10 000 Kč včetně daně. */
export const KH_LIMIT = 10_000;

/** Index sazby v KH: 1 = 21 %, 2 = 12 %, 3 = ostatní (10, 15 %). */
function rateSlot(rate: number): 1 | 2 | 3 {
  if (rate >= 20) return 1;
  if (rate >= 11) return 2;
  return 3;
}

export async function buildKhXml(userId: string, period: KhPeriod, projectId?: string | null) {
  const { year } = period;
  const from = period.quarter
    ? new Date(Date.UTC(year, (period.quarter - 1) * 3, 1))
    : new Date(Date.UTC(year, (period.month ?? 1) - 1, 1));
  const to = period.quarter
    ? new Date(Date.UTC(year, period.quarter * 3, 1))
    : new Date(Date.UTC(year, period.month ?? 1, 1));

  // spolusprávce projektu zpracovává doklady stejně jako vlastník
  const scope = await managedProjectIds({ id: userId, email: (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null });
  const [me, expenses, incomes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        billingName: true,
        billingIco: true,
        billingDic: true,
        taxSubjectType: true,
        firstName: true,
        lastName: true,
        street: true,
        houseNo: true,
        orientNo: true,
        city: true,
        zip: true,
        country: true,
        phone: true,
        dataBoxId: true,
        taxOfficeCode: true,
        taxOfficeBranch: true,
      },
    }),
    prisma.expense.findMany({
      where: {
        projectId: projectId ? projectId : { in: scope },
        deductible: true,
        OR: [
          { taxDate: { gte: from, lt: to } },
          { taxDate: null, date: { gte: from, lt: to }, vatAmount: { not: null } },
        ],
      },
      orderBy: [{ taxDate: "asc" }, { date: "asc" }],
      select: {
        amount: true,
        date: true,
        taxDate: true,
        docNumber: true,
        vatBase: true,
        vatAmount: true,
        vatBreakdown: true,
        currency: true,
        exchangeRate: true,
        supplierDic: true,
        vendor: { select: { dic: true } },
      },
    }),
    prisma.income.findMany({
      where: {
        projectId: projectId ? projectId : { in: scope },
        taxable: true,
        OR: [
          { taxDate: { gte: from, lt: to } },
          { taxDate: null, date: { gte: from, lt: to }, vatAmount: { not: null } },
        ],
      },
      orderBy: [{ taxDate: "asc" }, { date: "asc" }],
      select: {
        amount: true,
        date: true,
        taxDate: true,
        docNumber: true,
        vatBase: true,
        vatAmount: true,
        vatBreakdown: true,
        currency: true,
        exchangeRate: true,
        customerDic: true,
      },
    }),
  ]);
  if (!me) throw new Error("Uživatel nenalezen.");

  const taxed = expenses.filter((e) => e.vatAmount != null || e.vatBase != null);
  const missing: string[] = [];
  if (!me.billingDic) missing.push("DIČ v Nastavení → Fakturace a daně");
  if (!me.taxOfficeCode) missing.push("kód finančního úřadu");

  type Row = { dic: string; num: string; dppd: Date; slots: Record<1 | 2 | 3, { base: number; vat: number }> };
  const empty = () => ({ 1: { base: 0, vat: 0 }, 2: { base: 0, vat: 0 }, 3: { base: 0, vat: 0 } }) as Row["slots"];
  const b2: Row[] = [];
  const b3 = empty();
  const a4: Row[] = [];
  const a5 = empty();

  for (const e of taxed) {
    const dic = (e.supplierDic ?? e.vendor?.dic ?? "").replace(/\s/g, "").toUpperCase();
    const list = vatRowsCzk(e, () => 21);
    const slots = empty();
    for (const r of list) {
      const s = rateSlot(Number(r.rate));
      slots[s].base += Number(r.base);
      slots[s].vat += Number(r.vat);
    }
    const single = amountCzk(e) >= KH_LIMIT && !!dic && !!e.docNumber;
    if (single) {
      b2.push({ dic: dic.replace(/^CZ/, ""), num: e.docNumber!, dppd: e.taxDate ?? e.date, slots });
    } else {
      for (const k of [1, 2, 3] as const) {
        b3[k].base += slots[k].base;
        b3[k].vat += slots[k].vat;
      }
      if (amountCzk(e) >= KH_LIMIT && (!dic || !e.docNumber))
        missing.push(`doklad ${e.docNumber ?? "(bez čísla)"} nad 10 000 Kč nemá DIČ nebo číslo – je jen v B.3`);
    }
  }

  // vystavené doklady → A.4 / A.5
  for (const i of incomes) {
    if (i.vatAmount == null && i.vatBase == null) continue;
    const dic = (i.customerDic ?? "").replace(/\s/g, "").toUpperCase();
    const list = vatRowsCzk(i, () => 21);
    const slots = empty();
    for (const r of list) {
      const sl = rateSlot(Number(r.rate));
      slots[sl].base += Number(r.base);
      slots[sl].vat += Number(r.vat);
    }
    if (amountCzk(i) >= KH_LIMIT && dic && i.docNumber) {
      a4.push({ dic: dic.replace(/^CZ/, ""), num: i.docNumber, dppd: i.taxDate ?? i.date, slots });
    } else {
      for (const k of [1, 2, 3] as const) {
        a5[k].base += slots[k].base;
        a5[k].vat += slots[k].vat;
      }
      if (amountCzk(i) >= KH_LIMIT && (!dic || !i.docNumber))
        missing.push(`vystavený doklad ${i.docNumber ?? "(bez čísla)"} nad 10 000 Kč nemá DIČ odběratele nebo číslo – je jen v A.5`);
    }
  }

  const hasB3 = [1, 2, 3].some((k) => b3[k as 1].base || b3[k as 1].vat);
  const hasA5 = [1, 2, 3].some((k) => a5[k as 1].base || a5[k as 1].vat);
  const sumBase = b2.reduce((a, r) => a + r.slots[1].base + r.slots[2].base + r.slots[3].base, 0) + (hasB3 ? b3[1].base + b3[2].base + b3[3].base : 0);
  const sumVat = b2.reduce((a, r) => a + r.slots[1].vat + r.slots[2].vat + r.slots[3].vat, 0) + (hasB3 ? b3[1].vat + b3[2].vat + b3[3].vat : 0);

  const isPO = me.taxSubjectType === "PO";
  const veta: string[] = [];
  veta.push(
    `<VetaD ${attr({
      k_uladb: "B",
      khdph_forma: "B", // B = řádné hlášení
      dokument: "KH1",
      mesic: period.month,
      ctvrt: period.quarter,
      rok: year,
      d_poddp: czDate(new Date()),
    })}/>`,
  );
  veta.push(
    `<VetaP ${attr({
      c_ufo: me.taxOfficeCode,
      c_pracufo: me.taxOfficeBranch,
      dic: (me.billingDic ?? "").replace(/^CZ/i, ""),
      typ_ds: isPO ? "P" : "F",
      jmeno: isPO ? null : me.firstName,
      prijmeni: isPO ? null : me.lastName,
      nazev_prace: isPO ? me.billingName : null,
      ulice: me.street,
      c_pop: me.houseNo,
      c_orient: me.orientNo,
      naz_obce: me.city,
      psc: (me.zip ?? "").replace(/\s/g, ""),
      stat: me.country,
      c_telef: me.phone,
      email: me.email,
      id_dats: me.dataBoxId,
      sest_jmeno: me.firstName ?? me.name,
      sest_prijmeni: me.lastName,
    })}/>`,
  );
  a4.forEach((r, i) => {
    veta.push(
      `<VetaA4 ${attr({
        c_radku: i + 1,
        dic_odb: r.dic,
        c_evid_dd: r.num,
        dppd: czDate(r.dppd),
        zakl_dane1: r.slots[1].base ? amount(r.slots[1].base) : null,
        dan1: r.slots[1].vat ? amount(r.slots[1].vat) : null,
        zakl_dane2: r.slots[2].base ? amount(r.slots[2].base) : null,
        dan2: r.slots[2].vat ? amount(r.slots[2].vat) : null,
        zakl_dane3: r.slots[3].base ? amount(r.slots[3].base) : null,
        dan3: r.slots[3].vat ? amount(r.slots[3].vat) : null,
        kod_rezim_pl: 0,
        zdph_44: "N",
        pomer: "N",
      })}/>`,
    );
  });
  if (hasA5)
    veta.push(
      `<VetaA5 ${attr({
        zakl_dane1: a5[1].base ? amount(a5[1].base) : null,
        dan1: a5[1].vat ? amount(a5[1].vat) : null,
        zakl_dane2: a5[2].base ? amount(a5[2].base) : null,
        dan2: a5[2].vat ? amount(a5[2].vat) : null,
        zakl_dane3: a5[3].base ? amount(a5[3].base) : null,
        dan3: a5[3].vat ? amount(a5[3].vat) : null,
      })}/>`,
    );
  b2.forEach((r, i) => {
    veta.push(
      `<VetaB2 ${attr({
        c_radku: i + 1,
        dic_dod: r.dic,
        c_evid_dd: r.num,
        dppd: czDate(r.dppd),
        zakl_dane1: r.slots[1].base ? amount(r.slots[1].base) : null,
        dan1: r.slots[1].vat ? amount(r.slots[1].vat) : null,
        zakl_dane2: r.slots[2].base ? amount(r.slots[2].base) : null,
        dan2: r.slots[2].vat ? amount(r.slots[2].vat) : null,
        zakl_dane3: r.slots[3].base ? amount(r.slots[3].base) : null,
        dan3: r.slots[3].vat ? amount(r.slots[3].vat) : null,
        pomer: "N",
        zdph_44: "N",
      })}/>`,
    );
  });
  if (hasB3)
    veta.push(
      `<VetaB3 ${attr({
        zakl_dane1: b3[1].base ? amount(b3[1].base) : null,
        dan1: b3[1].vat ? amount(b3[1].vat) : null,
        zakl_dane2: b3[2].base ? amount(b3[2].base) : null,
        dan2: b3[2].vat ? amount(b3[2].vat) : null,
        zakl_dane3: b3[3].base ? amount(b3[3].base) : null,
        dan3: b3[3].vat ? amount(b3[3].vat) : null,
      })}/>`,
    );
  veta.push(`<VetaC ${attr({ obrat23: amount(sumBase), pln23: amount(sumVat) })}/>`);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Pisemnost nazevSW="DMS" verzeSW="1.0">\n` +
    `  <DPHKH1 verzePis="03.01">\n` +
    veta.map((v) => `    ${v}`).join("\n") +
    `\n  </DPHKH1>\n</Pisemnost>\n`;

  return { xml, b2Count: b2.length, a4Count: a4.length, hasB3, hasA5, sumBase, sumVat, missing: [...new Set(missing)] };
}
