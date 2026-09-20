import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { amountCzk, vatTotalsCzk } from "@/lib/vat";

/**
 * CSV podkladu pro DPH: doklady období podle DUZP (základ, daň, sazby, DIČ,
 * číslo dokladu) + řádek pro oddíl kontrolního hlášení. Otevře se v Excelu.
 */
const csvField = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const row = (v: (string | number | null | undefined)[]) => v.map((x) => csvField(x == null ? "" : String(x))).join(";");
const KH_LIMIT = 10_000;

function periodRange(period: string, year: number): [Date, Date] {
  if (period.startsWith("q")) {
    const q = Math.min(4, Math.max(1, Number(period.slice(1)) || 1));
    return [new Date(Date.UTC(year, (q - 1) * 3, 1)), new Date(Date.UTC(year, q * 3, 1))];
  }
  if (period === "rok") return [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))];
  const m = Math.min(12, Math.max(1, Number(period.replace("m", "")) || 1));
  return [new Date(Date.UTC(year, m - 1, 1)), new Date(Date.UTC(year, m, 1))];
}
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10).split("-").reverse().join(".") : "");

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
  const period = url.searchParams.get("period") || `m${new Date().getUTCMonth() + 1}`;
  const projectId = url.searchParams.get("project") || "";
  const [from, to] = periodRange(period, year);

  const incomes = await prisma.income.findMany({
    where: {
      project: { ownerId: session.user.id },
      ...(projectId ? { projectId } : {}),
      OR: [
        { taxDate: { gte: from, lt: to } },
        { taxDate: null, date: { gte: from, lt: to }, vatAmount: { not: null } },
      ],
    },
    orderBy: [{ taxDate: "asc" }, { date: "asc" }],
    select: {
      title: true,
      amount: true,
      currency: true,
      date: true,
      taxDate: true,
      docNumber: true,
      vatBase: true,
      exchangeRate: true,
      vatAmount: true,
      vatBreakdown: true,
      customerName: true,
      customerIco: true,
      customerDic: true,
      taxable: true,
      project: { select: { name: true } },
    },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      project: { ownerId: session.user.id },
      ...(projectId ? { projectId } : {}),
      OR: [
        { taxDate: { gte: from, lt: to } },
        { taxDate: null, date: { gte: from, lt: to }, vatAmount: { not: null } },
      ],
    },
    orderBy: [{ taxDate: "asc" }, { date: "asc" }],
    select: {
      title: true,
      amount: true,
      currency: true,
      date: true,
      taxDate: true,
      docNumber: true,
      vatBase: true,
      exchangeRate: true,
      vatAmount: true,
      vatBreakdown: true,
      supplierIco: true,
      supplierDic: true,
      deductible: true,
      project: { select: { name: true } },
      vendor: { select: { name: true, ico: true, dic: true } },
    },
  });

  const lines = [
    row([
      "smer",
      "projekt",
      "duzp",
      "datum",
      "cislo_dokladu",
      "dodavatel",
      "ico",
      "dic",
      "zaklad",
      "dan",
      "sazby",
      "celkem",
      "mena",
      "kurz",
      "zaklad_czk",
      "dan_czk",
      "celkem_czk",
      "oddil_kh",
      "do_dph",
      "nazev",
    ]),
  ];
  for (const e of expenses) {
    const dic = e.supplierDic ?? e.vendor?.dic ?? "";
    const rates = ((e.vatBreakdown as { rate: number; base: number; vat: number }[] | null) ?? [])
      .map((r) => `${r.rate}%: ${r.base}/${r.vat}`)
      .join(" | ");
    const kh = !e.deductible ? "" : amountCzk(e) >= KH_LIMIT && dic ? "B.2" : "B.3";
    const czk = vatTotalsCzk(e);
    lines.push(
      row([
        "prijaty",
        e.project.name,
        d(e.taxDate),
        d(e.date),
        e.docNumber ?? "",
        e.vendor?.name ?? "",
        e.supplierIco ?? e.vendor?.ico ?? "",
        dic,
        e.vatBase != null ? Number(e.vatBase).toFixed(2) : "",
        e.vatAmount != null ? Number(e.vatAmount).toFixed(2) : "",
        rates,
        Number(e.amount).toFixed(2),
        e.currency,
        e.currency === "CZK" ? "" : String(e.exchangeRate ?? ""),
        czk.base.toFixed(2),
        czk.vat.toFixed(2),
        amountCzk(e).toFixed(2),
        kh,
        e.deductible ? "ano" : "ne",
        e.title,
      ]),
    );
  }

  for (const i of incomes) {
    const rates = ((i.vatBreakdown as { rate: number; base: number; vat: number }[] | null) ?? [])
      .map((r) => `${r.rate}%: ${r.base}/${r.vat}`)
      .join(" | ");
    const kh = !i.taxable ? "" : amountCzk(i) >= KH_LIMIT && i.customerDic ? "A.4" : "A.5";
    const czk = vatTotalsCzk(i);
    lines.push(
      row([
        "vystaveny",
        i.project.name,
        d(i.taxDate),
        d(i.date),
        i.docNumber ?? "",
        i.customerName ?? "",
        i.customerIco ?? "",
        i.customerDic ?? "",
        i.vatBase != null ? Number(i.vatBase).toFixed(2) : "",
        i.vatAmount != null ? Number(i.vatAmount).toFixed(2) : "",
        rates,
        Number(i.amount).toFixed(2),
        i.currency,
        i.currency === "CZK" ? "" : String(i.exchangeRate ?? ""),
        czk.base.toFixed(2),
        czk.vat.toFixed(2),
        amountCzk(i).toFixed(2),
        kh,
        i.taxable ? "ano" : "ne",
        i.title,
      ]),
    );
  }

  const name = `dph-${year}-${period}${projectId ? "-projekt" : ""}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}
