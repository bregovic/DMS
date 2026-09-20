import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { FinanceNav } from "@/components/invoices/finance-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "k úhradě", cls: "text-orange-700" },
  paid: { label: "uhrazeno", cls: "text-emerald-700" },
  cancelled: { label: "stornováno", cls: "text-stone-400" },
};

type Row = {
  id: string;
  number: string;
  kind: string;
  status: string;
  amount: unknown;
  currency: string;
  dueDate: Date;
  project: { name: string };
  supplier?: unknown;
};

function InvoiceTable({ rows, who }: { rows: Row[]; who: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left text-stone-500">
            <th className="py-2 font-medium">Doklad</th>
            <th className="py-2 font-medium">{who}</th>
            <th className="py-2 font-medium">Projekt</th>
            <th className="py-2 font-medium">Splatnost</th>
            <th className="py-2 text-right font-medium">Částka</th>
            <th className="py-2 text-right font-medium">Stav</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const st = STATUS[i.status] ?? STATUS.requested;
            const sup = (i.supplier as { name?: string } | undefined)?.name;
            return (
              <tr key={i.id} className="border-b border-stone-100">
                <td className="py-1.5">
                  <Link href={`/faktury/${i.id}`} className="font-medium text-stone-950 underline-offset-2 hover:underline">
                    {i.kind === "request" ? "Žádost" : "Faktura"} {i.number}
                  </Link>
                </td>
                <td className="py-1.5 text-stone-600">{sup ?? "—"}</td>
                <td className="py-1.5 text-stone-600">{i.project.name}</td>
                <td className="py-1.5 whitespace-nowrap text-stone-600">{formatDate(i.dueDate)}</td>
                <td className="py-1.5 text-right font-mono">{formatCurrency(Number(i.amount), i.currency)}</td>
                <td className={`py-1.5 text-right text-xs ${st.cls}`}>{st.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Faktury a žádosti o úhradu: co jsem vystavil a co mám zaplatit. */
export default async function InvoicesPage() {
  const user = await requireUser();
  const [issued, received] = await Promise.all([
    prisma.invoice.findMany({
      where: { issuerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, number: true, kind: true, status: true, amount: true, currency: true, dueDate: true, issueDate: true, project: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { OR: [{ recipientId: user.id }, { project: { ownerId: user.id } }], NOT: { issuerId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        amount: true,
        currency: true,
        dueDate: true,
        supplier: true,
        project: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Doklady a fakturace</h1>
      </header>
      <FinanceNav />

      <section className="mt-8">
        <h2 className="kicker mb-2">Přijaté žádosti o úhradu · {received.length}</h2>
        {received.length === 0 ? (
          <p className="text-sm text-stone-500">Nikdo po tobě nic nechce.</p>
        ) : (
          <InvoiceTable rows={received} who="Od koho" />
        )}
      </section>

      <section className="mt-10">
        <h2 className="kicker mb-2">Moje vystavené · {issued.length}</h2>
        {issued.length === 0 ? (
          <EmptyState
            title="Zatím jsi nic nevystavil"
            description="Fakturu nebo žádost o úhradu vystavíš z vykázané práce v Moje úkoly → Moje vykázaná práce a vyúčtování."
          />
        ) : (
          <InvoiceTable rows={issued} who="Doklad" />
        )}
      </section>
    </div>
  );
}
