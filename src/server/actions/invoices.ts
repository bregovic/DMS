"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager } from "@/server/access";
import { EXPENSE_PAID_STAGE, isExpensePaid } from "@/lib/constants";
import { resolveIban } from "@/lib/payment";
import { notifyUsers } from "@/server/notify";
import { formatCurrency } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export type InvoiceParty = {
  name: string;
  ico?: string | null;
  dic?: string | null;
  address?: string | null;
  account?: string | null;
  email?: string | null;
  vatPayer?: boolean;
};

/**
 * Žádost o úhradu = faktura z vykázané práce (Moje úkoly).
 *
 * Dodavatel vybere své nezaplacené a dosud nefakturované výkazy; za každý
 * projekt vznikne jedna faktura (číselná řada vystavovatele RRRR-NNNN,
 * VS = RRRRNNNN, splatnost 14 dní). Údaje stran se uloží jako snímek, aby
 * pozdější změna profilu nezměnila vystavenou fakturu. Vlastník projektu
 * dostane oznámení, zaplatí přes QR a označí fakturu jako uhrazenou.
 */
export async function createInvoices(formData: FormData): Promise<{ ids: string[]; error?: string }> {
  try {
    return await createInvoicesInner(formData);
  } catch (e) {
    // chyby server akcí se v produkci maskují – text vracíme jako hodnotu
    return { ids: [], error: e instanceof Error ? e.message : "Fakturu se nepodařilo vystavit." };
  }
}

async function createInvoicesInner(formData: FormData) {
  const user = await requireUser();
  const ids = formData.getAll("expenseIds").map(String).filter(Boolean);
  if (!ids.length) throw new Error("Vyber výkazy k fakturaci.");
  const note = String(formData.get("note") || "").trim().slice(0, 500) || null;
  // faktura, nebo žádost o úhradu (kdo nemá živnost / IČO)
  const kind = formData.get("kind") === "request" ? "request" : "invoice";

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      billingName: true,
      billingIco: true,
      billingDic: true,
      billingAddress: true,
      billingAccount: true,
      vatPayer: true,
    },
  });
  if (!me?.billingName || !me.billingAccount)
    throw new Error("Nejdřív doplň fakturační údaje v Nastavení (jméno/firma a číslo účtu).");
  if (!resolveIban(me.billingAccount)) throw new Error("Číslo účtu v Nastavení nejde převést na IBAN – zkontroluj ho.");

  const exps = await prisma.expense.findMany({
    where: { id: { in: ids }, createdById: user.id, invoiceId: null },
    select: { id: true, projectId: true, amount: true, currency: true, stage: true },
  });
  const usable = exps.filter((e) => !isExpensePaid(e.stage) && Number(e.amount) > 0);
  if (!usable.length) throw new Error("Vybrané výkazy už jsou fakturované nebo zaplacené.");

  const supplier: InvoiceParty = {
    name: me.billingName,
    ico: me.billingIco,
    dic: me.billingDic,
    address: me.billingAddress,
    account: me.billingAccount,
    email: me.email,
    vatPayer: me.vatPayer,
  };

  const byProject = new Map<string, typeof usable>();
  for (const e of usable) byProject.set(e.projectId, [...(byProject.get(e.projectId) ?? []), e]);

  const year = new Date().getFullYear();
  const created: string[] = [];
  for (const [projectId, list] of byProject) {
    const currencies = new Set(list.map((e) => e.currency));
    if (currencies.size > 1) throw new Error("Výkazy jednoho projektu mají různé měny – fakturuj je zvlášť.");
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        ownerId: true,
        owner: { select: { name: true, email: true, billingName: true, billingIco: true, billingDic: true, billingAddress: true } },
      },
    });
    if (!project) continue;
    const customer: InvoiceParty = {
      name: project.owner.billingName ?? project.owner.name ?? project.owner.email ?? "Odběratel",
      ico: project.owner.billingIco,
      dic: project.owner.billingDic,
      address: project.owner.billingAddress,
      email: project.owner.email,
    };
    // číselná řada vystavovatele v roce
    const last = await prisma.invoice.findFirst({
      where: { issuerId: user.id, number: { startsWith: `${year}-` } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const seq = (last ? Number(last.number.split("-")[1]) : 0) + 1;
    const number = `${year}-${String(seq).padStart(4, "0")}`;
    const amount = list.reduce((a, e) => a + Number(e.amount), 0);
    const inv = await prisma.invoice.create({
      data: {
        number,
        kind,
        projectId,
        issuerId: user.id,
        recipientId: project.ownerId,
        dueDate: new Date(Date.now() + 14 * 86400000),
        amount,
        currency: [...currencies][0] ?? "CZK",
        vs: `${year}${String(seq).padStart(4, "0")}`,
        supplier: supplier as unknown as Prisma.InputJsonValue,
        customer: customer as unknown as Prisma.InputJsonValue,
        note,
      },
      select: { id: true },
    });
    await prisma.expense.updateMany({ where: { id: { in: list.map((e) => e.id) } }, data: { invoiceId: inv.id } });
    await notifyUsers([project.ownerId], {
      kind: "invoice_requested",
      title: `Žádost o úhradu: ${kind === "request" ? "" : "faktura "}${number} – ${formatCurrency(amount, [...currencies][0] ?? "CZK")}`,
      body: `${supplier.name} · ${project.name}`,
      href: `/faktury/${inv.id}`,
      projectId,
      dedupeKey: `invoice:${inv.id}`,
    });
    created.push(inv.id);
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath("/ukoly");
  revalidatePath("/payments");
  return { ids: created };
}

async function invoiceCtx(id: string) {
  const user = await requireUser();
  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, number: true, kind: true, projectId: true, issuerId: true, recipientId: true, status: true, amount: true, currency: true },
  });
  if (!inv) throw new Error("Faktura nenalezena.");
  const manager = inv.recipientId === user.id || isManager(await getProjectRole(inv.projectId, user));
  return { user, inv, manager, issuer: inv.issuerId === user.id };
}

/** Vlastník: faktura zaplacena → výkazy uhrazené, oznámení dodavateli. */
export async function markInvoicePaid(formData: FormData) {
  const { user, inv, manager } = await invoiceCtx(String(formData.get("id")));
  if (!manager) throw new Error("Úhradu potvrzuje vlastník projektu.");
  if (inv.status !== "requested") throw new Error("Faktura už není k úhradě.");
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: inv.id }, data: { status: "paid", paidAt: new Date() } }),
    prisma.expense.updateMany({ where: { invoiceId: inv.id }, data: { stage: EXPENSE_PAID_STAGE } }),
  ]);
  if (inv.issuerId !== user.id)
    await notifyUsers([inv.issuerId], {
      kind: "invoice_paid",
      title: `${inv.kind === "request" ? "Žádost o úhradu" : "Faktura"} ${inv.number} byla uhrazena – ${formatCurrency(Number(inv.amount), inv.currency)}`,
      href: `/faktury/${inv.id}`,
      projectId: inv.projectId,
      dedupeKey: `invoice-paid:${inv.id}`,
    });
  revalidatePath(`/faktury/${inv.id}`);
  revalidatePath(`/projects/${inv.projectId}`);
  revalidatePath("/payments");
  revalidatePath("/ukoly");
}

/** Dodavatel: stornovat nezaplacenou fakturu – výkazy se uvolní k nové fakturaci. */
export async function cancelInvoice(formData: FormData) {
  const { inv, issuer } = await invoiceCtx(String(formData.get("id")));
  if (!issuer) throw new Error("Stornovat může jen vystavitel.");
  if (inv.status !== "requested") throw new Error("Zaplacenou fakturu nejde stornovat.");
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: inv.id }, data: { status: "cancelled" } }),
    prisma.expense.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } }),
  ]);
  revalidatePath(`/faktury/${inv.id}`);
  revalidatePath("/ukoly");
  revalidatePath("/payments");
}
