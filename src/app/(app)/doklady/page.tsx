import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { FinanceNav } from "@/components/invoices/finance-nav";
import { DocUploadBox } from "@/components/expenses/doc-upload-box";
import { DocScanReview } from "@/components/expenses/doc-scan-review";
import { EmptyState } from "@/components/ui/empty-state";
import { getExpenseCategories } from "@/server/expense-categories";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Doklady napříč projekty: co čeká na kontrolu po vytěžení a co už je
 * zaúčtované jako výdaj (s číslem dokladu, DUZP a DPH).
 */
export default async function DocsPage() {
  const user = await requireUser();
  const [projects, categories] = await Promise.all([
    prisma.project.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getExpenseCategories(),
  ]);
  const ids = projects.map((p) => p.id);

  const [scans, docs] = await Promise.all([
    prisma.docScan.findMany({
      where: { projectId: { in: ids }, status: { in: ["running", "ready", "error"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, projectId: true, status: true, result: true, document: { select: { id: true, originalName: true } } },
    }),
    prisma.expense.findMany({
      where: { projectId: { in: ids }, docNumber: { not: null } },
      orderBy: [{ taxDate: "desc" }, { date: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        amount: true,
        currency: true,
        date: true,
        taxDate: true,
        docNumber: true,
        vatAmount: true,
        deductible: true,
        project: { select: { id: true, name: true } },
        vendor: { select: { name: true } },
        documents: { select: { id: true }, take: 1 },
      },
    }),
  ]);
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const cats = categories.map((c) => ({ key: c.key, label: c.label }));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Doklady a fakturace</h1>
      </header>
      <FinanceNav />

      <div className="mt-6">
        <DocUploadBox projects={projects} />
        <p className="mt-2 text-[11px] text-stone-400">
          Účtenku i fakturu systém přečte: dodavatele podle IČO z ARESu, číslo dokladu, DUZP, základ a DPH po sazbách
          a jednotlivé položky. Výdaj založíš až po kontrole.
        </p>
      </div>

      {scans.length > 0 && (
        <section className="mt-8">
          <h2 className="kicker mb-2">Ke kontrole · {scans.length}</h2>
          <ul className="border-t border-stone-200">
            {scans.map((sc) => {
              const r = sc.result as { supplier?: { name?: string | null }; total?: number | null; number?: string | null } | null;
              return (
                <li key={sc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-200 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 basis-56 truncate text-stone-900" title={sc.document.originalName}>
                    {sc.document.originalName}
                    {r?.supplier?.name && <span className="text-xs text-stone-500"> · {r.supplier.name}</span>}
                    {r?.number && <span className="text-xs text-stone-400"> · č. {r.number}</span>}
                  </span>
                  <span className="text-xs text-stone-500">{projName.get(sc.projectId)}</span>
                  {r?.total != null && <span className="font-mono text-stone-950">{formatCurrency(r.total)}</span>}
                  <span className={`w-28 text-right text-xs ${sc.status === "ready" ? "text-orange-700" : sc.status === "error" ? "text-red-600" : "text-stone-500"}`}>
                    {sc.status === "ready" ? "ke kontrole" : sc.status === "error" ? "nepřečteno" : "čtu doklad…"}
                  </span>
                  <DocScanReview
                    scanId={sc.id}
                    documentId={sc.document.id}
                    projectId={sc.projectId}
                    categories={cats}
                    label={sc.status === "error" ? "Zkusit znovu" : "Zkontrolovat"}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="kicker mb-2">Zaúčtované doklady</h2>
        {docs.length === 0 ? (
          <EmptyState
            title="Zatím žádné doklady"
            description="Nahraj účtenku nebo fakturu výše – systém ji přečte a připraví výdaj ke kontrole."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="py-2 font-medium">DUZP</th>
                  <th className="py-2 font-medium">Číslo</th>
                  <th className="py-2 font-medium">Dodavatel</th>
                  <th className="py-2 font-medium">Projekt</th>
                  <th className="py-2 text-right font-medium">Celkem</th>
                  <th className="py-2 text-right font-medium">DPH</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((e) => (
                  <tr key={e.id} className="border-b border-stone-100">
                    <td className="py-1.5 whitespace-nowrap">{formatDate(e.taxDate ?? e.date)}</td>
                    <td className="py-1.5">{e.docNumber}</td>
                    <td className="py-1.5">
                      {e.vendor?.name ?? "—"}
                      <span className="block text-xs text-stone-400">{e.title}</span>
                    </td>
                    <td className="py-1.5">
                      <Link href={`/projects/${e.project.id}?tab=vydaje`} className="text-stone-700 underline-offset-2 hover:underline">
                        {e.project.name}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right font-mono">{formatCurrency(Number(e.amount), e.currency)}</td>
                    <td className="py-1.5 text-right font-mono">
                      {e.vatAmount != null ? formatCurrency(Number(e.vatAmount), e.currency) : "—"}
                      {!e.deductible && <span className="block text-[10px] text-stone-400">mimo DPH</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
