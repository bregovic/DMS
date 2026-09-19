import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager } from "@/server/access";
import { buildSpd, resolveIban } from "@/lib/payment";
import { formatCurrency, formatDate } from "@/lib/utils";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import type { InvoiceParty } from "@/server/actions/invoices";

const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "K úhradě", cls: "border-orange-400 text-orange-700" },
  paid: { label: "Uhrazeno", cls: "border-emerald-500 text-emerald-700" },
  cancelled: { label: "Stornováno", cls: "border-stone-400 text-stone-500" },
};

function Party({ title, p }: { title: string; p: InvoiceParty }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-500">{title}</p>
      <p className="font-semibold text-stone-950">{p.name}</p>
      {p.address && <p className="whitespace-pre-line">{p.address}</p>}
      {p.ico && <p>IČO: {p.ico}</p>}
      {p.dic && <p>DIČ: {p.dic}</p>}
      {p.email && <p className="text-stone-500">{p.email}</p>}
    </div>
  );
}

/** Faktura / žádost o úhradu – A4 s QR platbou; tisk nebo stažení PDF. */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const { id } = await params;
  const autoPdf = (await searchParams).pdf === "1";
  const user = await requireUser();
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      expenses: {
        orderBy: { date: "asc" },
        select: { id: true, title: true, date: true, hours: true, rate: true, amount: true, description: true, task: { select: { title: true } } },
      },
    },
  });
  if (!inv) notFound();
  const issuer = inv.issuerId === user.id;
  const manager = inv.recipientId === user.id || isManager(await getProjectRole(inv.projectId, user));
  if (!issuer && !manager) notFound();

  const isRequest = inv.kind === "request";
  const docName = isRequest ? "Žádost o úhradu" : "Faktura";
  const supplier = inv.supplier as unknown as InvoiceParty;
  const customer = inv.customer as unknown as InvoiceParty;
  const iban = resolveIban(supplier.account ?? null);
  const qr =
    iban && inv.status === "requested"
      ? await QRCode.toDataURL(
          buildSpd({ iban, amount: Number(inv.amount), currency: inv.currency, vs: inv.vs, msg: `${docName} ${inv.number}` }),
          { margin: 1, width: 220 },
        )
      : null;
  const st = STATUS[inv.status] ?? STATUS.requested;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={issuer ? "/ukoly" : "/payments"} className="kicker text-stone-400 hover:text-stone-950">
          ← {issuer ? "Moje úkoly" : "Platby"}
        </Link>
        <InvoiceActions
          id={inv.id}
          number={inv.number}
          fileName={`${isRequest ? "zadost-o-uhradu" : "faktura"}-${inv.number}.pdf`}
          autoPdf={autoPdf}
          canPay={manager && inv.status === "requested"}
          canCancel={issuer && inv.status === "requested"}
        />
      </div>

      {/* A4 list – pevná šířka kvůli PDF; na mobilu se posouvá do strany */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          id="invoice-sheet"
          className="mx-auto w-[794px] bg-white p-12 text-[13px] leading-relaxed text-stone-800 shadow-soft print:w-full print:p-0 print:shadow-none"
        >
          <div className="flex items-start justify-between border-b-2 border-stone-950 pb-5">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-stone-950">{docName}</p>
              <p className="mt-1 text-stone-500">č. {inv.number}</p>
            </div>
            <span className={`border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${st.cls}`}>{st.label}</span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-8">
            <Party title="Dodavatel" p={supplier} />
            <Party title={isRequest ? "Plátce" : "Odběratel"} p={customer} />
          </div>

          <div className="mt-6 grid grid-cols-4 gap-4 border-y border-stone-200 py-3 text-xs">
            <div>
              <p className="text-stone-500">Datum vystavení</p>
              <p className="font-medium text-stone-950">{formatDate(inv.issueDate)}</p>
            </div>
            <div>
              <p className="text-stone-500">Splatnost</p>
              <p className="font-medium text-stone-950">{formatDate(inv.dueDate)}</p>
            </div>
            <div>
              <p className="text-stone-500">Variabilní symbol</p>
              <p className="font-medium text-stone-950">{inv.vs}</p>
            </div>
            <div>
              <p className="text-stone-500">Způsob úhrady</p>
              <p className="font-medium text-stone-950">převodem</p>
            </div>
          </div>

          <p className="mt-5 text-xs text-stone-500">Za práce na zakázce: {inv.project.name}</p>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-300 text-left text-stone-500">
                <th className="py-1.5 pr-2 font-medium">Datum</th>
                <th className="py-1.5 pr-2 font-medium">Popis</th>
                <th className="py-1.5 pr-2 text-right font-medium">Hodiny</th>
                <th className="py-1.5 pr-2 text-right font-medium">Sazba</th>
                <th className="py-1.5 text-right font-medium">Částka</th>
              </tr>
            </thead>
            <tbody>
              {inv.expenses.map((e) => (
                <tr key={e.id} className="border-b border-stone-100 align-top">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-1.5 pr-2">
                    {e.task?.title ?? e.title}
                    {e.description && <span className="block text-stone-500">{e.description}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{e.hours != null ? Number(e.hours).toLocaleString("cs-CZ") : "–"}</td>
                  <td className="py-1.5 pr-2 text-right">{e.rate != null ? formatCurrency(Number(e.rate), inv.currency) : "–"}</td>
                  <td className="py-1.5 text-right font-medium text-stone-950">{formatCurrency(Number(e.amount), inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-64 border-t-2 border-stone-950 pt-2 text-right">
              <p className="text-xs text-stone-500">Celkem k úhradě</p>
              <p className="text-2xl font-semibold text-stone-950">{formatCurrency(Number(inv.amount), inv.currency)}</p>
              {isRequest ? (
                <p className="text-[11px] text-stone-500">Nejde o daňový doklad.</p>
              ) : (
                !supplier.vatPayer && <p className="text-[11px] text-stone-500">Dodavatel není plátcem DPH.</p>
              )}
            </div>
          </div>

          <div className="mt-8 flex items-end justify-between gap-6 border-t border-stone-200 pt-5">
            <div className="text-xs">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Platební údaje</p>
              <p>Účet: {supplier.account}</p>
              {iban && <p>IBAN: {iban}</p>}
              <p>VS: {inv.vs}</p>
              {inv.note && <p className="mt-2 text-stone-600">{inv.note}</p>}
              {inv.status === "paid" && inv.paidAt && (
                <p className="mt-2 font-medium text-emerald-700">Uhrazeno {formatDate(inv.paidAt)}</p>
              )}
            </div>
            {qr && (
              <div className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR platba" width={140} height={140} />
                <p className="text-[10px] text-stone-500">QR platba</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
