import { prisma } from "@/lib/prisma";

/**
 * Přiznání k DPH (písemnost DPHDP3) z dokladů evidovaných v aplikaci.
 *
 * Počítá jen to, co v evidenci opravdu je: uskutečněná plnění v tuzemsku
 * (vystavené doklady) a nárok na odpočet z přijatých dokladů. Nepokrývá
 * zálohy, opravy, přenesenou daňovou povinnost, dovoz, vývoz ani plnění
 * osvobozená – ty je potřeba doplnit na portálu ručně.
 *
 * Soubor slouží k načtení na portálu MOJE daně, kde projde kontrolou.
 */

export type Dp3Period = { year: number; month?: number; quarter?: number };

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attr = (o: Record<string, string | number | null | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(" ");
const czDate = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join(".");
/** V přiznání se základy i daň uvádějí v celých korunách. */
const round = (n: number) => Math.round(n);

export type Dp3Summary = {
  /** ř. 1 – dodání zboží / služby v základní sazbě */
  out21: { base: number; vat: number };
  /** ř. 2 – v první snížené sazbě */
  out12: { base: number; vat: number };
  /** ř. 40 – přijatá plnění v základní sazbě */
  in21: { base: number; vat: number };
  /** ř. 41 – přijatá plnění ve snížené sazbě */
  in12: { base: number; vat: number };
  /** ř. 62, 63, 64/66 */
  taxOut: number;
  deduction: number;
  result: number;
  missing: string[];
};

export async function buildDp3(userId: string, period: Dp3Period, projectId?: string | null) {
  const { year } = period;
  const from = period.quarter
    ? new Date(Date.UTC(year, (period.quarter - 1) * 3, 1))
    : new Date(Date.UTC(year, (period.month ?? 1) - 1, 1));
  const to = period.quarter
    ? new Date(Date.UTC(year, period.quarter * 3, 1))
    : new Date(Date.UTC(year, period.month ?? 1, 1));
  const win = {
    OR: [
      { taxDate: { gte: from, lt: to } },
      { taxDate: null, date: { gte: from, lt: to }, vatAmount: { not: null } },
    ],
  };

  const [me, expenses, incomes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        billingName: true,
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
      where: { project: { ownerId: userId }, ...(projectId ? { projectId } : {}), deductible: true, ...win },
      select: { vatBase: true, vatAmount: true, vatBreakdown: true },
    }),
    prisma.income.findMany({
      where: { project: { ownerId: userId }, ...(projectId ? { projectId } : {}), taxable: true, ...win },
      select: { vatBase: true, vatAmount: true, vatBreakdown: true },
    }),
  ]);
  if (!me) throw new Error("Uživatel nenalezen.");

  const acc = () => ({ 21: { base: 0, vat: 0 }, 12: { base: 0, vat: 0 }, 0: { base: 0, vat: 0 } });
  const add = (
    target: ReturnType<typeof acc>,
    rows: { rate: number; base: number; vat: number }[] | null,
    fallbackBase: number,
    fallbackVat: number,
  ) => {
    const list = rows?.length ? rows : [{ rate: fallbackVat > 0 ? 21 : 0, base: fallbackBase, vat: fallbackVat }];
    for (const r of list) {
      const k = Number(r.rate) >= 20 ? 21 : Number(r.rate) >= 11 ? 12 : 0;
      target[k].base += Number(r.base) || 0;
      target[k].vat += Number(r.vat) || 0;
    }
  };
  const out = acc();
  const inp = acc();
  for (const i of incomes) add(out, i.vatBreakdown as never, Number(i.vatBase ?? 0), Number(i.vatAmount ?? 0));
  for (const e of expenses) add(inp, e.vatBreakdown as never, Number(e.vatBase ?? 0), Number(e.vatAmount ?? 0));

  const taxOut = round(out[21].vat + out[12].vat);
  const deduction = round(inp[21].vat + inp[12].vat);
  const missing: string[] = [];
  if (!me.billingDic) missing.push("DIČ v Nastavení → Fakturace a daně");
  if (!me.taxOfficeCode) missing.push("kód finančního úřadu");
  if (out[0].base > 0) missing.push("v evidenci jsou vystavené doklady bez DPH – zkontroluj, zda patří do přiznání");

  const summary: Dp3Summary = {
    out21: { base: round(out[21].base), vat: round(out[21].vat) },
    out12: { base: round(out[12].base), vat: round(out[12].vat) },
    in21: { base: round(inp[21].base), vat: round(inp[21].vat) },
    in12: { base: round(inp[12].base), vat: round(inp[12].vat) },
    taxOut,
    deduction,
    result: taxOut - deduction,
    missing,
  };

  const isPO = me.taxSubjectType === "PO";
  const veta: string[] = [];
  veta.push(
    `<VetaD ${attr({
      k_uladb: "B",
      dapdph_forma: "B", // B = řádné přiznání
      dokument: "DP3",
      mesic: period.month,
      ctvrt: period.quarter,
      rok: year,
      d_poddp: czDate(new Date()),
      typ_platce: "P",
      trans: "N",
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
  // ř. 1 a 2 – uskutečněná zdanitelná plnění v tuzemsku
  veta.push(
    `<Veta1 ${attr({
      obrat23: summary.out21.base || null,
      dan23: summary.out21.vat || null,
      obrat5: summary.out12.base || null,
      dan5: summary.out12.vat || null,
    })}/>`,
  );
  // ř. 40 a 41 – nárok na odpočet z přijatých zdanitelných plnění
  veta.push(
    `<Veta4 ${attr({
      pln23: summary.in21.base || null,
      odp_tuz23_nar: summary.in21.vat || null,
      pln5: summary.in12.base || null,
      odp_tuz5_nar: summary.in12.vat || null,
      odp_sum_nar: deduction || null,
    })}/>`,
  );
  // ř. 62–64 – daň na výstupu, odpočet, výsledek
  veta.push(
    `<Veta6 ${attr({
      dan_zocelk: taxOut,
      odp_zocelk: deduction,
      dano_da: summary.result > 0 ? summary.result : null,
      dano_no: summary.result < 0 ? -summary.result : null,
    })}/>`,
  );

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Pisemnost nazevSW="DMS" verzeSW="1.0">\n` +
    `  <DPHDP3 verzePis="01.02">\n` +
    veta.map((v) => `    ${v}`).join("\n") +
    `\n  </DPHDP3>\n</Pisemnost>\n`;

  return { xml, summary };
}
