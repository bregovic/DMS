"use server";

import QRCode from "qrcode";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/server/access";
import { buildSpd, resolveIban } from "@/lib/payment";

export type QrGroup = {
  accountLabel: string; // původní účet dodavatele (nebo IBAN)
  vendorName: string;
  amount: number;
  currency: string;
  count: number;
  vs: string | null;
  titles: string[];
  qr: string; // data URL PNG
};

export type QrAggregateResult =
  | { groups: QrGroup[]; skippedPaid: number; skippedNoBank: string[] }
  | { error: string };

/** Sdruží vybrané NEUHRAZENÉ výdaje projektu do QR plateb. Seskupuje podle
 *  bankovního účtu dodavatele (IBAN) a měny – jeden QR na účet+měnu. */
export async function aggregateExpensesQr(
  projectId: string,
  ids: string[],
): Promise<QrAggregateResult> {
  const user = await requireUser();
  const access = await getProjectAccess(projectId, user);
  if (!access) return { error: "Nemáte přístup k tomuto projektu." };

  const idList = [...new Set(ids)].filter(Boolean);
  if (idList.length === 0) return { error: "Nebyly vybrány žádné výdaje." };

  const expenses = await prisma.expense.findMany({
    where: { id: { in: idList }, projectId },
    include: {
      vendor: { select: { name: true, bankAccount: true } },
    },
  });
  if (expenses.length === 0) return { error: "Nebyly vybrány žádné výdaje." };

  let skippedPaid = 0;
  const skippedNoBank: string[] = [];
  // klíč = iban|currency
  const map = new Map<
    string,
    {
      iban: string;
      accountLabel: string;
      vendorName: string;
      currency: string;
      amount: number;
      titles: string[];
      vsSet: Set<string>;
    }
  >();

  for (const e of expenses) {
    if (e.paid) {
      skippedPaid++;
      continue;
    }
    const iban = resolveIban(e.vendor?.bankAccount);
    if (!iban) {
      skippedNoBank.push(e.title);
      continue;
    }
    const key = `${iban}|${e.currency}`;
    const g =
      map.get(key) ??
      {
        iban,
        accountLabel: e.vendor?.bankAccount ?? iban,
        vendorName: e.vendor?.name ?? "—",
        currency: e.currency,
        amount: 0,
        titles: [],
        vsSet: new Set<string>(),
      };
    g.amount += Number(e.amount);
    g.titles.push(e.title);
    if (e.variableSymbol) g.vsSet.add(e.variableSymbol);
    map.set(key, g);
  }

  if (map.size === 0) {
    if (skippedNoBank.length > 0 && skippedPaid === 0) {
      return { error: "Vybrané výdaje nemají u dodavatele platný bankovní účet." };
    }
    return { error: "Žádné neuhrazené výdaje s platebními údaji k vytvoření QR." };
  }

  const groups: QrGroup[] = [];
  for (const g of map.values()) {
    const vs = g.vsSet.size === 1 ? [...g.vsSet][0] : null;
    const msg =
      g.titles.length === 1
        ? g.titles[0]
        : `${g.vendorName} – ${g.titles.length} výdajů`;
    const spd = buildSpd({
      iban: g.iban,
      amount: g.amount,
      currency: g.currency,
      vs,
      msg,
    });
    const qr = await QRCode.toDataURL(spd, { width: 360, margin: 1 });
    groups.push({
      accountLabel: g.accountLabel,
      vendorName: g.vendorName,
      amount: Math.round(g.amount * 100) / 100,
      currency: g.currency,
      count: g.titles.length,
      vs,
      titles: g.titles,
      qr,
    });
  }

  // Nejdřív největší částky.
  groups.sort((a, b) => b.amount - a.amount);
  return { groups, skippedPaid, skippedNoBank };
}
