import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { managedProjectIds } from "@/server/access";
import { prisma } from "@/lib/prisma";
import { FinanceNav } from "@/components/invoices/finance-nav";
import { PeriodPicker } from "@/components/invoices/period-picker";
import { DocUploadBox } from "@/components/expenses/doc-upload-box";
import { DocScanReview } from "@/components/expenses/doc-scan-review";
import { DocScanQueue } from "@/components/expenses/doc-scan-queue";
import { DocFilters } from "@/components/invoices/doc-filters";
import { InboxQueue } from "@/components/expenses/inbox-queue";
import { EmptyState } from "@/components/ui/empty-state";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { DocPreview } from "@/components/documents/doc-preview";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDocument } from "@/server/actions/documents";
import { deleteExpense } from "@/server/actions/expenses";
import { deleteIncome } from "@/server/actions/incomes";
import { deleteScan, restartScan } from "@/server/actions/doc-scan";
import { getExpenseCategories } from "@/server/expense-categories";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
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
  /**
   * Přečtený doklad, ze kterého ještě nevznikl výdaj. Je v seznamu jako
   * ostatní, jen se stavem „ke kontrole" a s akcemi místo mazání výdaje.
   * Období ani filtry ho neschovají – jinak by se čekající doklad dal
   * ztratit přepnutím měsíce.
   */
  scan?: { id: string; nabidka: boolean; zaseklo: boolean } | null;
  /** Nahraný soubor, který ještě nikdo nečetl. */
  unread?: { documentId: string } | null;
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
  searchParams: Promise<{
    project?: string;
    year?: string;
    period?: string;
    smer?: string;
    typ?: string;
    q?: string;
    stav?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp?.year) || now.getUTCFullYear();
  const period = sp?.period || "vse";
  const projectId = sp?.project || "";
  const smer = sp?.smer === "in" || sp?.smer === "out" ? sp.smer : "";
  const typ = sp?.typ ?? "";
  const stav = sp?.stav ?? "";
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

  // Doklady, které uživatel nahrál do cizích projektů (dodavatel). Vidí jen
  // svoje a jejich stav – zpracování a účtování je na vlastníkovi projektu.
  const myUploads = await prisma.document.findMany({
    where: {
      uploadedById: user.id,
      type: { in: ["receipt", "invoice"] },
      project: { ownerId: { not: user.id } },
      projectId: { notIn: ids },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      originalName: true,
      createdAt: true,
      mimeType: true,
      expenseId: true,
      project: { select: { name: true } },
      subProject: { select: { name: true } },
      scan: { select: { status: true, result: true, expenseId: true } },
    },
  });

  const [scans, pendingDocs, mailsWaiting, expenses, incomes, invoices] = await Promise.all([
    prisma.docScan.findMany({
      // Doklad z projektu, nebo příloha z pošty, u které se projekt teprve určuje.
      where: {
        status: { in: ["running", "ready", "error"] },
        OR: [{ projectId: { in: scope } }, { inboundAttachment: { mail: { ownerId: user.id } } }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        projectId: true,
        status: true,
        result: true,
        updatedAt: true,
        document: { select: { id: true, originalName: true, mimeType: true } },
        inboundAttachment: {
          select: { id: true, originalName: true, mail: { select: { subject: true, fromName: true, fromAddress: true } } },
        },
      },
    }),
    // doklady, které poslal někdo jiný (dodavatel) a ještě nejsou přečtené
    prisma.document.findMany({
      where: {
        projectId: { in: scope },
        type: { in: ["receipt", "invoice"] },
        expenseId: null,
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
        subProjectId: true,
        type: true,
        uploadedBy: { select: { name: true, email: true } },
      },
    }),
    // pošta, u které ještě nic přečteného není
    prisma.inboundMail.findMany({
      where: { ownerId: user.id, attachments: { some: { documentId: null, scan: { is: null } } } },
      orderBy: { receivedAt: "desc" },
      take: 30,
      select: {
        id: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        attachments: { where: { documentId: null, scan: { is: null } }, select: { originalName: true } },
      },
    }),
    prisma.expense.findMany({
      /* Doklad = má číslo, přiloženou účtenku/fakturu, nebo rozpis DPH.
         Dřív stačilo jen číslo, takže přečtená účtenka bez čísla po založení
         zmizela: ze fronty vypadla (je zpracovaná) a sem se nedostala. */
      where: {
        projectId: { in: scope },
        OR: [
          { docNumber: { not: null } },
          { vatAmount: { not: null } },
          { documents: { some: { type: { in: ["receipt", "invoice"] } } } },
        ],
      },
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
        subProjectId: true,
        vendor: { select: { name: true } },
        documents: { select: { id: true, type: true, originalName: true, mimeType: true }, take: 1 },
      },
    }),
    prisma.income.findMany({
      where: {
        projectId: { in: scope },
        OR: [{ docNumber: { not: null } }, { vatAmount: { not: null } }, { documentId: { not: null } }],
      },
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
        subProjectId: true,
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

  /* Složky projektů: v seznamu je potřeba vidět „Dům › Garáž", ne jen „Dům" –
     doklad patří do složky a podle ní se hledá. Jedním dotazem za všechny. */
  const subs = await prisma.subProject.findMany({
    where: { projectId: { in: ids } },
    select: { id: true, name: true, parentId: true, projectId: true },
  });
  const subById = new Map(subs.map((x) => [x.id, x]));
  /** Složky jednoho projektu pro dialog kontroly – s celou cestou v názvu. */
  const slozkyProjektu = (projectId: string) =>
    subs
      .filter((x) => x.projectId === projectId)
      .map((x) => {
        const cesta: string[] = [];
        let cur: (typeof subs)[number] | undefined = x;
        while (cur) {
          cesta.unshift(cur.name);
          cur = cur.parentId ? subById.get(cur.parentId) : undefined;
        }
        return { id: x.id, name: cesta.join(" › ") };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  const misto = (projectId: string, subProjectId: string | null | undefined) => {
    const projekt = projName.get(projectId) ?? "";
    if (!subProjectId) return projekt;
    const cesta: string[] = [];
    let cur = subById.get(subProjectId);
    while (cur) {
      cesta.unshift(cur.name);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    return cesta.length ? `${projekt} › ${cesta.join(" › ")}` : projekt;
  };
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
      projectName: misto(e.projectId, e.subProjectId),
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
      projectName: misto(i.projectId, i.subProjectId),
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
  // Přečtené doklady, ze kterých ještě nevznikl výdaj – do seznamu mezi
  // ostatní, se stavem „ke kontrole". Dřív stály v samostatné sekci nad ním.
  for (const sc of scans) {
    const r = sc.result as {
      supplier?: { name?: string | null };
      total?: number | null;
      number?: string | null;
      docKind?: string | null;
      docType?: string | null;
      subProjectId?: string | null;
      taxDate?: string | null;
      issueDate?: string | null;
      totalVat?: number | null;
      currency?: string | null;
    } | null;
    const nazev = sc.document?.originalName ?? sc.inboundAttachment?.originalName ?? "dokument";
    // Čtení běží na pozadí; nasazení ho utne a stav „running" by pak zůstal
    // navždy. Po deseti minutách ho bereme jako nedokončené.
    const zaseklo = sc.status === "running" && Date.now() - sc.updatedAt.getTime() > 10 * 60_000;
    const datum = r?.taxDate ?? r?.issueDate ?? null;
    rows.push({
      id: `s${sc.id}`,
      kind: r?.docType === "receipt" ? "receipt" : "invoice-in",
      direction: "in",
      date: datum ? new Date(datum) : sc.updatedAt,
      docNumber: r?.number ?? null,
      party: r?.supplier?.name ?? nazev,
      projectId: sc.projectId ?? "",
      projectName: sc.projectId
        ? misto(sc.projectId, r?.subProjectId)
        : sc.inboundAttachment
          ? `z pošty · ${sc.inboundAttachment.mail.fromName ?? sc.inboundAttachment.mail.fromAddress}`
          : "",
      amount: r?.total != null ? Number(r.total) : 0,
      currency: r?.currency ?? "CZK",
      vat: r?.totalVat != null ? Number(r.totalVat) : null,
      status:
        sc.status === "ready" ? "ke kontrole" : sc.status === "error" ? "nepřečteno" : zaseklo ? "nedokončeno" : "čtu doklad…",
      href: "/doklady",
      doc: sc.document ? { id: sc.document.id, name: nazev, mimeType: sc.document.mimeType } : null,
      scan: { id: sc.id, nabidka: r?.docKind === "nabidka", zaseklo },
    });
  }

  // Nahrané doklady před přečtením – taky do seznamu, ať se dají filtrovat
  // a nejsou ve zvláštním bloku nad ním.
  for (const d of pendingDocs) {
    rows.push({
      id: `u${d.id}`,
      kind: d.type === "invoice" ? "invoice-in" : "receipt",
      direction: "in",
      date: d.createdAt,
      docNumber: null,
      party: d.originalName,
      projectId: d.projectId,
      projectName: misto(d.projectId, d.subProjectId),
      amount: 0,
      currency: "CZK",
      vat: null,
      status: "nepřečteno",
      href: "/doklady",
      doc: { id: d.id, name: d.originalName, mimeType: d.mimeType },
      unread: { documentId: d.id },
    });
  }

  const rozdelane = (r: Row) => !!r.scan || !!r.unread;
  const shown = rows
    .filter((r) => {
      const hledani =
        !q ||
        (r.docNumber ?? "").toLowerCase().includes(q) ||
        (r.party ?? "").toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q);
      if (!hledani) return false;
      // Výslovný filtr na stav platí i pro rozdělanou práci.
      if (stav === "prace") return rozdelane(r);
      if (stav === "uhrazeno") return !rozdelane(r) && (r.status === "uhrazeno" || r.status === "přijato");
      if (stav === "neuhrazeno") return !rozdelane(r) && r.status === "k úhradě";
      // Jinak rozdělanou práci období ani ostatní filtry neschovají – jinak
      // by se čekající doklad dal ztratit přepnutím měsíce.
      return rozdelane(r) || ((!smer || r.direction === smer) && (!typ || r.kind === typ));
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  // Doklad ke kontrole ještě zaúčtovaný není, do součtů se nepočítá.
  const sum = (dir: "in" | "out") =>
    shown.filter((r) => !r.scan && !r.unread && r.direction === dir).reduce((a, r) => a + r.amount, 0);
  const keKontrole = shown.filter((r) => r.scan?.id && r.status === "ke kontrole");

  const years = [now.getUTCFullYear() + 1, now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2, year]
    .filter((y, i, a) => a.indexOf(y) === i)
    .sort((a, b) => b - a);
  const qs = (over: Record<string, string>) => {
    const u = new URLSearchParams({ ...(projectId ? { project: projectId } : {}), period, year: String(year), ...(smer ? { smer } : {}), ...(typ ? { typ } : {}), ...(stav ? { stav } : {}), ...(q ? { q } : {}), ...over });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    return `/doklady?${u.toString()}`;
  };
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Doklady a fakturace</h1>
      </header>
      <FinanceNav />
      <AutoRefresh
        when={scans.some((s) => s.status === "running" && Date.now() - s.updatedAt.getTime() < 10 * 60_000)}
      />

      {projects.length > 0 && (
        <div className="mt-6">
          <DocUploadBox projects={projects} />
          <p className="mt-2 text-[11px] text-stone-400">
            Nahrané doklady i pošta čekají v Nezpracovaných, dokud je nepřečteš. Vlastní faktura se založí jako příjem.
          </p>
        </div>
      )}

      {/* Dodavatel: co jsem nahrál do cizích projektů a jak na tom je. */}
      {myUploads.length > 0 && (
        <section className="mt-6">
          <h2 className="kicker mb-2">Moje nahrané doklady · {myUploads.length}</h2>
          <ul className="border-t border-stone-200">
            {myUploads.map((d) => {
              const r = (d.scan?.result ?? null) as { supplier?: { name?: string }; total?: number; currency?: string } | null;
              const hotovo = !!d.expenseId || !!d.scan?.expenseId;
              const stav = hotovo
                ? { label: "zaúčtováno", cls: "text-emerald-700" }
                : d.scan?.status === "running"
                  ? { label: "čte se", cls: "text-stone-500" }
                  : d.scan?.status === "ready"
                    ? { label: "čeká na majitele projektu", cls: "text-orange-700" }
                    : d.scan?.status === "error"
                      ? { label: "zpracuje majitel projektu", cls: "text-stone-500" }
                      : { label: "nahráno", cls: "text-stone-500" };
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-100 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 basis-48 truncate text-stone-900" title={d.originalName}>
                    {r?.supplier?.name ?? d.originalName}
                    <span className="block text-[11px] text-stone-400">
                      {d.project.name}
                      {d.subProject ? ` › ${d.subProject.name}` : ""} · {formatDate(d.createdAt)}
                    </span>
                  </span>
                  {r?.total != null && (
                    <span className="font-mono text-stone-950">{formatCurrency(r.total, r.currency ?? "CZK")}</span>
                  )}
                  <span className={`text-xs ${stav.cls}`}>{stav.label}</span>
                  <DocPreview documentId={d.id} name={d.originalName} mimeType={d.mimeType} />
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-stone-400">Doklad zaúčtuje majitel projektu.</p>
        </section>
      )}

      {/* Pošta, u které se teprve pozná, co to je – nahrané soubory jsou
          v seznamu níž, aby se daly filtrovat. */}
      <InboxQueue
        mails={mailsWaiting.map((m) => ({
          id: m.id,
          subject: m.subject,
          from: m.fromName ?? m.fromAddress,
          files: m.attachments.map((a) => a.originalName),
        }))}
        files={[]}
      />

      <section className="mt-8 space-y-3">
        <PeriodPicker period={period} year={year} projectId={projectId} projects={projects} years={years} allowAll />
        <DocFilters
          typy={(Object.keys(KIND_LABEL) as Row["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          stavy={[
            { value: "prace", label: "Rozdělané (nepřečtené a ke kontrole)" },
            { value: "neuhrazeno", label: "K úhradě" },
            { value: "uhrazeno", label: "Uhrazené" },
          ]}
        />
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
          <button type="submit" className="h-11 cursor-pointer border border-stone-300 px-3 text-sm text-stone-700 hover:border-stone-950 sm:h-9">
            Hledat
          </button>
          {q && (
            <Link href={qs({ q: "" })} className="text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline">
              zrušit hledání
            </Link>
          )}
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-stone-500">
            {shown.length} dokladů · přijaté <span className="font-mono">{formatCurrency(sum("in"))}</span> · vystavené{" "}
            <span className="font-mono">{formatCurrency(sum("out"))}</span>
            {keKontrole.length > 0 && <span className="text-orange-700"> · {keKontrole.length} ke kontrole</span>}
          </p>
          {keKontrole.length > 0 && (
            <DocScanQueue
              scans={keKontrole.map((r) => ({
                id: r.scan!.id,
                documentId: r.doc?.id ?? null,
                projectId: r.projectId || null,
                originalName: r.doc?.name ?? r.party ?? "dokument",
              }))}
              categories={categories.map((c) => ({ key: c.key, label: c.label }))}
            />
          )}
        </div>
      </section>

      <section className="mt-4">
        {shown.length === 0 ? (
          <EmptyState
            title="Žádné doklady"
            description="Nahraj účtenku nebo fakturu výše – systém ji přečte a připraví ke kontrole. Vystavené faktury z vykázané práce se sem přidají samy."
          />
        ) : (
          /* Na telefonu se tabulka nesmí roztáhnout dlouhým číslem dokladu:
             dlouhé texty se krátí (celé jsou v title) a DPH s projektem
             se schová – obojí je v detailu dokladu. */
          <div className="hscroll overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed text-sm sm:min-w-[820px] sm:table-auto">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="w-[5.5rem] py-2 pl-2 font-medium sm:w-auto">Datum</th>
                  <th className="hidden py-2 font-medium sm:table-cell">Typ</th>
                  <th className="w-24 py-2 font-medium sm:w-auto">Číslo</th>
                  <th className="py-2 font-medium">Protistrana</th>
                  <th className="hidden py-2 font-medium sm:table-cell">Projekt</th>
                  <th className="w-24 py-2 text-right font-medium sm:w-auto">Částka</th>
                  <th className="hidden py-2 text-right font-medium sm:table-cell">DPH</th>
                  <th className="w-[5.5rem] py-2 text-right font-medium sm:w-auto">Stav</th>
                  <th className="w-[4.5rem] py-2 sm:w-auto" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-stone-100">
                    <td className="py-1.5 pl-2 align-top whitespace-nowrap">
                      {formatDateShort(r.date)}
                      {/* Druh a projekt se na telefonu vejdou jen pod datum. */}
                      <span className="block truncate text-[11px] text-stone-400 sm:hidden">
                        {r.scan?.nabidka ? "Nabídka" : KIND_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="hidden py-1.5 align-top sm:table-cell">
                      <span className={r.direction === "out" ? "text-emerald-700" : "text-stone-700"}>
                        {r.scan?.nabidka ? "Nabídka" : KIND_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="py-1.5 align-top">
                      <Link
                        href={r.href}
                        title={r.docNumber ?? undefined}
                        className="block truncate text-stone-900 underline-offset-2 hover:underline sm:overflow-visible sm:whitespace-normal"
                      >
                        {r.docNumber ?? "—"}
                      </Link>
                    </td>
                    <td className="py-1.5 align-top text-stone-600">
                      <span className="block truncate sm:overflow-visible sm:whitespace-normal" title={r.party ?? undefined}>
                        {r.party ?? "—"}
                      </span>
                      <span className="block truncate text-[11px] text-stone-400 sm:hidden">{r.projectName}</span>
                    </td>
                    <td className="hidden py-1.5 align-top text-stone-600 sm:table-cell">
                      <span className="block truncate sm:overflow-visible sm:whitespace-normal" title={r.projectName}>
                        {r.projectName}
                      </span>
                    </td>
                    <td className="py-1.5 text-right align-top font-mono whitespace-nowrap">{formatCurrency(r.amount, r.currency)}</td>
                    <td className="hidden py-1.5 text-right align-top font-mono text-stone-500 sm:table-cell">{r.vat != null ? formatCurrency(r.vat, r.currency) : "—"}</td>
                    <td className={`py-1.5 text-right align-top text-xs ${r.status === "uhrazeno" || r.status === "přijato" ? "text-emerald-700" : r.status === "stornováno" ? "text-stone-400" : "text-orange-700"}`}>
                      {r.status}
                    </td>
                    <td className="py-1.5 pl-2 text-right align-top">
                      <span className="flex flex-wrap items-center justify-end gap-1 sm:flex-nowrap sm:whitespace-nowrap">
                      {r.doc ? (
                        <DocPreview documentId={r.doc.id} name={r.doc.name} mimeType={r.doc.mimeType} />
                      ) : (
                        <Link href={r.href} className="text-xs text-stone-400 underline-offset-2 hover:text-stone-950 hover:underline">
                          otevřít
                        </Link>
                      )}
                      {r.unread ? (
                        <>
                          <DeleteButton action={deleteDocument} fields={{ id: r.unread.documentId }} confirm="Smazat nahraný doklad?" />
                          <DocScanReview
                            scanId={null}
                            documentId={r.unread.documentId}
                            projectId={r.projectId}
                            subProjects={slozkyProjektu(r.projectId)}
                            categories={categories.map((c) => ({ key: c.key, label: c.label }))}
                            label="Přečíst"
                          />
                        </>
                      ) : r.scan ? (
                        <>
                          {/* Přečíst znovu jde u všeho, co zrovna neběží – i u hotového,
                              když se návrh netrefil nebo vznikal starší verzí. */}
                          {(r.status !== "čtu doklad…" || r.scan.zaseklo) && (
                            <form action={restartScan}>
                              <input type="hidden" name="scanId" value={r.scan.id} />
                              <button
                                type="submit"
                                title="Přečíst znovu"
                                className="flex size-8 cursor-pointer items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white"
                              >
                                <RotateCcw className="size-4" />
                              </button>
                            </form>
                          )}
                          <DeleteButton
                            action={deleteScan}
                            fields={{ scanId: r.scan.id }}
                            confirm="Zahodit přečtení? Soubor zůstane mezi nezpracovanými a půjde přečíst znovu."
                          />
                          <DocScanReview
                            scanId={r.scan.id}
                            documentId={r.doc?.id ?? null}
                            projectId={r.projectId || null}
                            subProjects={slozkyProjektu(r.projectId)}
                            categories={categories.map((c) => ({ key: c.key, label: c.label }))}
                            label={r.status === "nepřečteno" ? "Zkusit znovu" : "Otevřít"}
                          />
                        </>
                      ) : (
                        <>
                          {(r.kind === "receipt" || r.kind === "invoice-in") && (
                            <DeleteButton
                              action={deleteExpense}
                              fields={{ id: r.id.slice(1), projectId: r.projectId }}
                              confirm={`Smazat doklad ${r.docNumber ?? ""} i s přílohou?`}
                            />
                          )}
                          {r.kind === "invoice-out" && (
                            <DeleteButton
                              action={deleteIncome}
                              fields={{ id: r.id.slice(1), projectId: r.projectId }}
                              confirm={`Smazat doklad ${r.docNumber ?? ""}?`}
                            />
                          )}
                        </>
                      )}
                      </span>
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
