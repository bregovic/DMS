"use server";

import QRCode from "qrcode";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, managedProjectIds } from "@/server/access";
import { buildSpd, resolveIban } from "@/lib/payment";
import { revalidatePath } from "next/cache";
import { EXPENSE_PAID_STAGE, isExpensePaid } from "@/lib/constants";
import { payeeAccounts } from "@/server/payee";

/** Příjem od dodavatele, který jde započítat proti tomu, co se mu platí. */
export type QrOffset = {
  id: string;
  title: string;
  date: string;
  /** Kolik z příjmu zbývá k zápočtu (částka minus už započtené). */
  available: number;
  currency: string;
  project: string;
};

export type QrGroup = {
  accountLabel: string; // původní účet dodavatele (nebo IBAN)
  vendorId: string | null;
  vendorName: string;
  /** K úhradě po zápočtu – to je i částka v QR. */
  amount: number;
  /** Výdaje dohromady, před zápočtem. */
  gross: number;
  /** Co se do téhle platby započetlo. */
  offsets: { id: string; title: string; amount: number }[];
  /** Nezapočtené příjmy dodavatele, které jdou ještě nabídnout. */
  candidates: QrOffset[];
  currency: string;
  count: number;
  vs: string | null;
  titles: string[];
  ids: string[]; // id výdajů reálně v této QR (pro potvrzení úhrady)
  qr: string; // data URL PNG
};

export type QrAggregateResult =
  | { groups: QrGroup[]; skippedPaid: number; skippedNoBank: string[] }
  | { error: string };

/** Zápočty zvolené uživatelem: z kterého příjmu kolik použít. */
export type QrOffsetInput = { incomeId: string; amount: number };

/** Sdruží vybrané NEUHRAZENÉ výdaje projektu do QR plateb. Seskupuje podle
 *  bankovního účtu dodavatele (IBAN) a měny – jeden QR na účet+měnu. */
export async function aggregateExpensesQr(
  /** null = napříč projekty (modul Platby) */
  projectId: string | null,
  ids: string[],
  /** Zápočty, které uživatel zaškrtl v dialogu. */
  offsets: QrOffsetInput[] = [],
): Promise<QrAggregateResult> {
  const user = await requireUser();
  let scope: string[] | null = null;
  if (projectId) {
    const access = await getProjectAccess(projectId, user);
    if (!access) return { error: "Nemáte přístup k tomuto projektu." };
  } else {
    scope = await managedProjectIds(user);
  }

  const idList = [...new Set(ids)].filter(Boolean);
  if (idList.length === 0) return { error: "Nebyly vybrány žádné výdaje." };

  const expenses = await prisma.expense.findMany({
    where: { id: { in: idList }, ...(projectId ? { projectId } : { projectId: { in: scope! } }) },
    include: {
      vendor: { select: { name: true, email: true, bankAccount: true } },
    },
  });
  if (expenses.length === 0) return { error: "Nebyly vybrány žádné výdaje." };

  const ucetDodavatele = await payeeAccounts(expenses.map((e) => e.vendor));

  let skippedPaid = 0;
  const skippedNoBank: string[] = [];
  // klíč = iban|currency
  const map = new Map<
    string,
    {
      iban: string;
      accountLabel: string;
      vendorId: string | null;
      vendorName: string;
      currency: string;
      amount: number;
      titles: string[];
      ids: string[];
      vsSet: Set<string>;
    }
  >();

  for (const e of expenses) {
    if (isExpensePaid(e.stage)) {
      skippedPaid++;
      continue;
    }
    const ucet = ucetDodavatele(e.vendor);
    const iban = resolveIban(ucet);
    if (!iban) {
      skippedNoBank.push(e.title);
      continue;
    }
    const key = `${iban}|${e.currency}`;
    const g =
      map.get(key) ??
      {
        iban,
        accountLabel: ucet ?? iban,
        vendorId: e.vendorId ?? null,
        vendorName: e.vendor?.name ?? "—",
        currency: e.currency,
        amount: 0,
        titles: [],
        ids: [],
        vsSet: new Set<string>(),
      };
    g.amount += Number(e.amount);
    g.titles.push(e.title);
    g.ids.push(e.id);
    if (e.variableSymbol) g.vsSet.add(e.variableSymbol);
    map.set(key, g);
  }

  if (map.size === 0) {
    if (skippedNoBank.length > 0 && skippedPaid === 0) {
      return { error: "Vybrané výdaje nemají u dodavatele platný bankovní účet." };
    }
    return { error: "Žádné neuhrazené výdaje s platebními údaji k vytvoření QR." };
  }

  /* Příjmy, které jde započítat: od tohohle dodavatele, nebo zatím
     nepřiřazené peněžní pohyby (půjčka, vratka). Daňové doklady se
     nenabízejí – vystavená faktura není zápočet, to je jiný účetní krok. */
  const vendorIds = [...new Set([...map.values()].map((g) => g.vendorId).filter((v): v is string => !!v))];
  const prijmy = await prisma.income.findMany({
    where: {
      projectId: projectId ? projectId : { in: scope! },
      docNumber: null,
      vatAmount: null,
      OR: [...(vendorIds.length ? [{ vendorId: { in: vendorIds } }] : []), { vendorId: null }],
    },
    orderBy: { date: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      date: true,
      amount: true,
      currency: true,
      vendorId: true,
      settledAmount: true,
      project: { select: { name: true } },
    },
  });
  const zbyva = (i: (typeof prijmy)[number]) =>
    Math.round((Number(i.amount) - Number(i.settledAmount ?? 0)) * 100) / 100;

  const zvolene = new Map(offsets.map((o) => [o.incomeId, o.amount]));

  const groups: QrGroup[] = [];
  for (const g of map.values()) {
    // Nabídnout jen to, co ještě má zbytek a sedí měnou.
    const nabidka = prijmy.filter(
      (i) => zbyva(i) > 0 && i.currency === g.currency && (i.vendorId === g.vendorId || i.vendorId === null),
    );
    const pouzite = nabidka
      .filter((i) => zvolene.has(i.id))
      .map((i) => ({
        id: i.id,
        title: i.title,
        // Zápočet nikdy nepřekročí zbytek příjmu ani dlužnou částku.
        amount: Math.min(zvolene.get(i.id)!, zbyva(i)),
      }));
    const gross = Math.round(g.amount * 100) / 100;
    const zapocteno = Math.min(
      gross,
      Math.round(pouzite.reduce((a, o) => a + o.amount, 0) * 100) / 100,
    );
    const amount = Math.round((gross - zapocteno) * 100) / 100;

    const vs = g.vsSet.size === 1 ? [...g.vsSet][0] : null;
    const msg =
      g.titles.length === 1
        ? g.titles[0]
        : `${g.vendorName} - ${g.titles.length} výdajů`;
    // Nulová platba QR nemá; kód se vyrobí jen když je co platit.
    const qr =
      amount > 0
        ? await QRCode.toDataURL(
            buildSpd({ iban: g.iban, amount, currency: g.currency, vs, msg }),
            { width: 360, margin: 1 },
          )
        : "";
    groups.push({
      accountLabel: g.accountLabel,
      vendorId: g.vendorId,
      vendorName: g.vendorName,
      amount,
      gross,
      offsets: pouzite,
      candidates: nabidka
        .filter((i) => !zvolene.has(i.id))
        .map((i) => ({
          id: i.id,
          title: i.title,
          date: i.date.toISOString().slice(0, 10),
          available: zbyva(i),
          currency: i.currency,
          project: i.project.name,
        })),
      currency: g.currency,
      count: g.titles.length,
      vs,
      titles: g.titles,
      ids: g.ids,
      qr,
    });
  }

  // Nejdřív největší částky.
  groups.sort((a, b) => b.amount - a.amount);
  return { groups, skippedPaid, skippedNoBank };
}

/**
 * Potvrzení úhrady: výdaje se označí uhrazené a započtené příjmy se tím
 * spotřebují (settledAmount), takže tentýž zápočet už od příští platby
 * neodečte. Příjem zároveň dostane dodavatele, ať se příště nabídne sám.
 *
 * Jedna transakce – výdaje označené za uhrazené bez spotřebovaného zápočtu
 * (nebo naopak) by znamenaly, že se o peníze přepočítá.
 */
export async function settlePaymentWithOffsets(
  expenseIds: string[],
  offsets: (QrOffsetInput & { vendorId?: string | null })[],
): Promise<{ paid: number; offset: number } | { error: string }> {
  const user = await requireUser();
  const scope = await managedProjectIds(user);

  const vydaje = await prisma.expense.findMany({
    where: { id: { in: [...new Set(expenseIds)] }, projectId: { in: scope } },
    select: { id: true },
  });
  if (vydaje.length === 0) return { error: "Nebyly vybrány žádné výdaje." };

  const prijmy = offsets.length
    ? await prisma.income.findMany({
        where: { id: { in: offsets.map((o) => o.incomeId) }, projectId: { in: scope } },
        select: { id: true, amount: true, settledAmount: true, vendorId: true },
      })
    : [];
  const podle = new Map(prijmy.map((i) => [i.id, i]));

  const zapisy = offsets.flatMap((o) => {
    const i = podle.get(o.incomeId);
    if (!i) return [];
    const zbyva = Number(i.amount) - Number(i.settledAmount ?? 0);
    const pouzito = Math.min(o.amount, zbyva);
    if (pouzito <= 0) return [];
    return [
      prisma.income.update({
        where: { id: i.id },
        data: {
          settledAmount: Math.round((Number(i.settledAmount ?? 0) + pouzito) * 100) / 100,
          ...(i.vendorId ? {} : o.vendorId ? { vendorId: o.vendorId } : {}),
        },
      }),
    ];
  });

  await prisma.$transaction([
    prisma.expense.updateMany({
      where: { id: { in: vydaje.map((e) => e.id) } },
      data: { stage: EXPENSE_PAID_STAGE },
    }),
    ...zapisy,
  ]);

  revalidatePath("/payments");
  revalidatePath("/doklady");
  return { paid: vydaje.length, offset: zapisy.length };
}
