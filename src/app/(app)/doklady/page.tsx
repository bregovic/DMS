import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { managedProjectIds } from "@/server/access";
import { prisma } from "@/lib/prisma";
import { FinanceNav } from "@/components/invoices/finance-nav";
import { PeriodPicker } from "@/components/invoices/period-picker";
import { DocUploadBox } from "@/components/expenses/doc-upload-box";
import { DocScanReview } from "@/components/expenses/doc-scan-review";
import { EmptyState } from "@/components/ui/empty-state";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { DocPreview } from "@/components/documents/doc-preview";
import { getExpenseCategories } from "@/server/expense-categories";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isExpensePaid } from "@/lib/constants";

/**
 * Doklady napříč projekty v jednom seznamu: přijaté (účtenky, faktury
 * dodavatelů) i vystavené (moje faktury a žádosti o úhradu). Filtruje se
 * typem, směrem (vstup/výstup), projektem a obdobím podle DUZP.
 */

type Row = {
  id: string;
  kind: "receipt" | "invoice-in" | "invoice-out" | "request-out";
  direction: "in" | "out";
  date: Date;
  docNumber: string | null;
  party: string | null;
  projectId: string;
  projectName: string;
  amount: number;
  currency: string;
  vat: number | null;
  status: string;
  href: string;
  doc?: { id: string; name: string; mimeType: string } | null;
};

const KIND_LABEL: Record<Row["kind"], string> = {
  receipt: "Účtenka",
  "invoice-in": "Faktura přijatá",
  "invoice-out": "Faktura vystavená",
  "request-out": "Žádost o úhradu",
};

function range(period: string, year: number): [Date, Date] | null {
  if (period === "vse") return null;
  if (period === "rok") return [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))];
  if (period.startsWith("q")) {
    const q = Math.min(4, Math.max(1, Number(period.slice(1)) || 1));
    return [new Date(Date.UTC(year, (q - 1) * 3, 1)), new Date(Date.UTC(year, q * 3, 1))];
  }
  const m = Math.min(12, Math.max(1, Number(period.replace("m", "")) || 1));
  return [new Date(Date.UTC(year, m - 1, 1)), new Date(Date.UTC(year, m, 1))];
}

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; year?: string; period?: string; smer?: string; typ?: string; q?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp?.year) || now.getUTCFullYear();
  const period = sp?.period || "vse";
  const projectId = sp?.project || "";
  const smer = sp?.smer === "in" || sp?.smer === "out" ? sp.smer : "";
  const typ = sp?.typ ?? "";
  const q = (sp?.q ?? "").trim().toLowerCase();
  const win = range(period, year);
  const inWin = (d: Date) => !win || (d >= win[0] && d < win[1]);

  const managedIds = await managedProjectIds(user);
  const [projects, categories] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: managedIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getExpenseCategories(),
  ]);
  const ids = projects.map((p) => p.id);
  const scope = projectId ? [projectId] : ids;

  const [scans, pendingDocs, expenses, incomes, invoices] = await Promise.all([
    prisma.docScan.findMany({
      where: { projectId: { in: scope }, status: { in: ["running", "ready", "error"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, projectId: true, status: true, result: true, document: { select: { id: true, originalName: true } } },
    }),
    // doklady, které poslal někdo jiný (dodavatel) a ještě nejsou přečtené
    prisma.document.findMany({
      where: {
        projectId: { in: scope },
        type: { in: ["receipt", "invoice"] },
        expenseId: null,
        uploadedById: { not: user.id },
        scan: { is: null },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        createdAt: true,
        projectId: true,
        uploadedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.expense.findMany({
      where: { projectId: { in: scope }, docNumber: { not: null } },
      orderBy: [{ taxDate: "desc" }, { date: "desc" }],
      take: 300,
      select: {
        id: true,
        title: true,
        amount: true,
        currency: true,
        date: true,
        taxDate: true,
        docNumber: true,
        vatAmount: true,
        stage: true,
        projectId: true,
        vendor: { select: { name: true } },
        documents: { select: { id: true, type: true, originalName: true, mimeType: true }, take: 1 },
      },
    }),
    prisma.income.findMany({
      where: { projectId: { in: scope }, docNumber: { not: null } },
      orderBy: [{ taxDate: "desc" }, { date: "desc" }],
      take: 300,
      select: {
        id: true,
        title: true,
        amount: true,
        currency: true,
        date: true,
        taxDate: true,
        docNumber: true,
        vatAmount: true,
        customerName: true,
        projectId: true,
        documentId: true,
      },
    }),
    prisma.invoice.findMany({
      where: { OR: [{ issuerId: user.id }, { recipientId: user.id }, { projectId: { in: managedIds } }], ...(projectId ? { projectId } : {}) },
      orderBy: { issueDate: "desc" },
      take: 200,
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        amount: true,
        currency: true,
        issueDate: true,
        issuerId: true,
        supplier: true,
        customer: true,
        projectId: true,
        project: { select: { name: true } },
      },
    }),
  ]);

  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const rows: Row[] = [];
  for (const e of expenses) {
    const d = e.taxDate ?? e.date;
    if (!inWin(d)) continue;
    rows.push({
      id: `e${e.id}`,
      kind: e.documents[0]?.type === "invoice" ? "invoice-in" : "receipt",
      direction: "in",
      date: d,
      docNumber: e.docNumber,
      party: e.vendor?.name ?? e.title,
      projectId: e.projectId,
      projectName: projName.get(e.projectId) ?? "",
      amount: Number(e.amount),
      currency: e.currency,
      vat: e.vatAmount != null ? Number(e.vatAmount) : null,
      status: isExpensePaid(e.stage) ? "uhrazeno" : "k úhradě",
      href: `/projects/${e.projectId}?tab=vydaje`,
      doc: e.documents[0]
        ? { id: e.documents[0].id, name: e.documents[0].originalName, mimeType: e.documents[0].mimeType }
        : null,
    });
  }
  for (const i of incomes) {
    const d = i.taxDate ?? i.date;
    if (!inWin(d)) continue;
    rows.push({
      id: `i${i.id}`,
      kind: "invoice-out",
      direction: "out",
      date: d,
      docNumber: i.docNumber,
      party: i.customerName ?? i.title,
      projectId: i.projectId,
      projectName: projName.get(i.projectId) ?? "",
      amount: Number(i.amount),
      currency: i.currency,
      vat: i.vatAmount != null ? Number(i.vatAmount) : null,
      status: "přijato",
      href: `/projects/${i.projectId}?tab=prijmy`,
      doc: i.documentId ? { id: i.documentId, name: `${i.docNumber ?? i.title}`, mimeType: "" } : null,
    });
  }
  for (const inv of invoices) {
    if (!inWin(inv.issueDate)) continue;
    const out = inv.issuerId === user.id;
    const party = ((out ? inv.customer : inv.supplier) as { name?: string } | null)?.name ?? null;
    rows.push({
      id: `f${inv.id}`,
      kind: inv.kind === "request" ? "request-out" : out ? "invoice-out" : "invoice-in",
      direction: out ? "out" : "in",
      date: inv.issueDate,
      docNumber: inv.number,
      party,
      projectId: inv.projectId,
      projectName: inv.project.name,
      amount: Number(inv.amount),
      currency: inv.currency,
      vat: null,
      status: inv.status === "paid" ? "uhrazeno" : inv.status === "cancelled" ? "stornováno" : "k úhradě",
      href: `/faktury/${inv.id}`,
    });
  }
  const shown = rows
    .filter(
      (r) =>
        (!smer || r.direction === smer) &&
        (!typ || r.kind === typ) &&
        (!q ||
          (r.docNumber ?? "").toLowerCase().includes(q) ||
          (r.party ?? "").toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const sum = (dir: "in" | "out") => shown.filter((r) => r.direction === dir).reduce((a, r) => a + r.amount, 0);

  const years = [now.getUTCFullYear() + 1, now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2, year]
    .filter((y, i, a) => a.indexOf(y) === i)
    .sort((a, b) => b - a);
  const qs = (over: Record<string, string>) => {
    const u = new URLSearchParams({ ...(projectId ? { project: projectId } : {}), period, year: String(year), ...(smer ? { smer } : {}), ...(typ ? { typ } : {}), ...(q ? { q } : {}), ...over });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    return `/doklady?${u.toString()}`;
  };
  const chip = (active: boolean) =>
    `border px-2 py-0.5 text-[11px] uppercase tracking-wide transition-colors ${
      active ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-500 hover:border-stone-950"
    }`;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Doklady a fakturace</h1>
      </header>
      <FinanceNav />
      <AutoRefresh when={scans.some((s) => s.status === "running")} />

      <div className="mt-6">
        <DocUploadBox projects={projects} />
        <p className="mt-2 text-[11px] text-stone-400">
          Z dokladu se přečte dodavatel (ARES), číslo, DUZP, DPH i položky. Vlastní faktura se založí jako příjem.
        </p>
      </div>

      {pendingDocs.length > 0 && (
        <section className="mt-6">
          <h2 className="kicker mb-2">Nové od spolupracovníků · {pendingDocs.length}</h2>
          <ul className="border-t border-stone-200">
            {pendingDocs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-200 py-2.5 text-sm">
                <span className="min-w-0 flex-1 basis-56 truncate text-stone-900" title={d.originalName}>
                  {d.originalName}
                  <span className="text-xs text-stone-500"> · {d.uploadedBy.name ?? d.uploadedBy.email}</span>
                </span>
                <span className="text-xs text-stone-500">{projName.get(d.projectId)}</span>
                <span className="text-xs text-stone-400">{formatDate(d.createdAt)}</span>
                <DocPreview documentId={d.id} name={d.originalName} mimeType={d.mimeType} />
                <DocScanReview
                  scanId={null}
                  documentId={d.id}
                  projectId={d.projectId}
                  categories={categories.map((c) => ({ key: c.key, label: c.label }))}
                  label="Přečíst doklad"
                />
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-stone-400">
            Přečtení spouštíš ty. Komu chceš čtení povolit, nastav v projektu → Nastavení → Přístup.
          </p>
        </section>
      )}

      {scans.length > 0 && (
        <section className="mt-6">
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
                    categories={categories.map((c) => ({ key: c.key, label: c.label }))}
                    label={sc.status === "error" ? "Zkusit znovu" : "Zkontrolovat"}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-8 space-y-3">
        <PeriodPicker period={period} year={year} projectId={projectId} projects={projects} years={years} allowAll />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 w-12">Směr</span>
          <Link href={qs({ smer: "" })} className={chip(!smer)}>
            Vše
          </Link>
          <Link href={qs({ smer: "in" })} className={chip(smer === "in")}>
            Vstup (přijaté)
          </Link>
          <Link href={qs({ smer: "out" })} className={chip(smer === "out")}>
            Výstup (vystavené)
          </Link>
          <span className="kicker ml-4 mr-1 w-12">Typ</span>
          <Link href={qs({ typ: "" })} className={chip(!typ)}>
            Vše
          </Link>
          {(Object.keys(KIND_LABEL) as Row["kind"][]).map((k) => (
            <Link key={k} href={qs({ typ: k })} className={chip(typ === k)}>
              {KIND_LABEL[k]}
            </Link>
          ))}
        </div>
        <form method="get" action="/doklady" className="flex flex-wrap items-center gap-2">
          {projectId && <input type="hidden" name="project" value={projectId} />}
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="year" value={String(year)} />
          {smer && <input type="hidden" name="smer" value={smer} />}
          {typ && <input type="hidden" name="typ" value={typ} />}
          <input
            name="q"
            defaultValue={sp?.q ?? ""}
            placeholder="Hledat číslo dokladu nebo protistranu…"
            className="h-9 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:border-stone-950 focus-visible:outline-none sm:w-80"
          />
          <button type="submit" className="h-9 cursor-pointer border border-stone-300 px-3 text-sm text-stone-700 hover:border-stone-950">
            Hledat
          </button>
          {q && (
            <Link href={qs({ q: "" })} className="text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline">
              zrušit hledání
            </Link>
          )}
        </form>
        <p className="text-xs text-stone-500">
          {shown.length} dokladů · přijaté <span className="font-mono">{formatCurrency(sum("in"))}</span> · vystavené{" "}
          <span className="font-mono">{formatCurrency(sum("out"))}</span>
        </p>
      </section>

      <section className="mt-4">
        {shown.length === 0 ? (
          <EmptyState
            title="Žádné doklady"
            description="Nahraj účtenku nebo fakturu výše – systém ji přečte a připraví ke kontrole. Vystavené faktury z vykázané práce se sem přidají samy."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="py-2 font-medium">Datum / DUZP</th>
                  <th className="py-2 font-medium">Typ</th>
                  <th className="py-2 font-medium">Číslo</th>
                  <th className="py-2 font-medium">Protistrana</th>
                  <th className="py-2 font-medium">Projekt</th>
                  <th className="py-2 text-right font-medium">Částka</th>
                  <th className="py-2 text-right font-medium">DPH</th>
                  <th className="py-2 text-right font-medium">Stav</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-stone-100">
                    <td className="py-1.5 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="py-1.5">
                      <span className={r.direction === "out" ? "text-emerald-700" : "text-stone-700"}>{KIND_LABEL[r.kind]}</span>
                    </td>
                    <td className="py-1.5">
                      <Link href={r.href} className="text-stone-900 underline-offset-2 hover:underline">
                        {r.docNumber ?? "—"}
                      </Link>
                    </td>
                    <td className="py-1.5 text-stone-600">{r.party ?? "—"}</td>
                    <td className="py-1.5 text-stone-600">{r.projectName}</td>
                    <td className="py-1.5 text-right font-mono">{formatCurrency(r.amount, r.currency)}</td>
                    <td className="py-1.5 text-right font-mono text-stone-500">{r.vat != null ? formatCurrency(r.vat, r.currency) : "—"}</td>
                    <td className={`py-1.5 text-right text-xs ${r.status === "uhrazeno" || r.status === "přijato" ? "text-emerald-700" : r.status === "stornováno" ? "text-stone-400" : "text-orange-700"}`}>
                      {r.status}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      {r.doc ? (
                        <DocPreview documentId={r.doc.id} name={r.doc.name} mimeType={r.doc.mimeType} />
                      ) : (
                        <Link href={r.href} className="text-xs text-stone-400 underline-offset-2 hover:text-stone-950 hover:underline">
                          otevřít
                        </Link>
                      )}
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
