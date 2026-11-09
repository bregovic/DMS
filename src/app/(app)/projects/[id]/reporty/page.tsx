import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, isManager } from "@/server/access";
import type { ReportData, ReportResult } from "@/server/cost-report";
import { reportSummary } from "@/components/reports/cost-report-view";
import { CostReportButton } from "@/components/reports/cost-report-button";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteCostReport } from "@/server/actions/cost-report";
import { AutoRefresh } from "@/components/ui/auto-refresh";

const STALE_MS = 10 * 60_000;
const isStale = (createdAt: Date) => Date.now() - createdAt.getTime() > STALE_MS;
const nf0 = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const tis = (v: number) => `${nf0.format(Math.round(v / 1000))} tis.`;
const mil = (v: number) => (v / 1e6).toFixed(2).replace(".", ",");
const when = (d: Date) =>
  d.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Reporty nákladů projektu / složky (#48) – přehled a PDF ke stažení. */
export default async function CostReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const sub = typeof sp?.sub === "string" && sp.sub ? sp.sub : null;
  const access = await getProjectAccess(id, user);
  if (!access || !isManager(access.role)) notFound();

  const [project, subs, reports] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { name: true } }),
    prisma.subProject.findMany({ where: { projectId: id }, select: { id: true, name: true } }),
    prisma.costReport.findMany({
      where: { projectId: id, ...(sub ? { subProjectId: sub } : {}) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, subProjectId: true, status: true, error: true, data: true, result: true, documentId: true,
        createdAt: true, costUsd: true, createdById: true,
      },
    }),
  ]);
  if (!project) notFound();
  const subName = new Map(subs.map((s) => [s.id, s.name]));
  if (sub && !subName.has(sub)) notFound();
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(reports.map((r) => r.createdById))] } },
    select: { id: true, name: true, email: true },
  });
  const authorName = new Map(authors.map((a) => [a.id, a.name ?? a.email ?? ""]));
  const docs = await prisma.document.findMany({
    where: { id: { in: reports.map((r) => r.documentId).filter((x): x is string => !!x) } },
    select: { id: true, size: true },
  });
  const docSize = new Map(docs.map((d) => [d.id, d.size]));

  const rows = reports.map((r) => {
    const running = r.status === "running" && !isStale(r.createdAt);
    const failed = r.status === "error" || (r.status === "running" && !running);
    const data = r.data as unknown as ReportData | null;
    const sum = r.status === "ready" && data ? reportSummary(data, r.result as unknown as ReportResult) : null;
    return { ...r, running, failed, sum };
  });
  const backHref = `/projects/${id}${sub ? `?sub=${sub}` : ""}`;
  const scope = sub ? subName.get(sub)! : project.name;

  return (
    <div className="mx-auto max-w-5xl">
      <AutoRefresh when={rows.some((r) => r.running)} ms={8000} />
      <Link href={backHref} className="kicker text-stone-400 hover:text-stone-950">
        ← {scope}
      </Link>
      <header className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-3xl text-stone-950">Reporty nákladů</h1>
          <p className="mt-1 text-sm text-stone-500">
            {sub ? `Složka ${scope}` : `Projekt ${scope}`} · {rows.length} {rows.length === 1 ? "report" : rows.length < 5 && rows.length > 0 ? "reporty" : "reportů"}
          </p>
        </div>
        <CostReportButton projectId={id} subProjectId={sub} />
      </header>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">Zatím žádný report.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left text-xs text-stone-500">
                <th className="py-2 pr-3 font-medium">Vytvořeno</th>
                {!sub && <th className="py-2 pr-3 font-medium">Složka</th>}
                <th className="py-2 pr-3 text-right font-medium">Utraceno</th>
                <th className="py-2 pr-3 text-right font-medium">Zbývá podle plánu</th>
                <th className="py-2 pr-3 text-right font-medium">Odhad celkem</th>
                <th className="py-2 pr-3 font-medium">PDF</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="group border-b border-stone-200 align-top">
                  <td className="py-2.5 pr-3">
                    <Link href={`/report/${r.id}`} className="font-medium text-stone-950 underline-offset-4 hover:underline">
                      {when(r.createdAt)}
                    </Link>
                    <span className="block text-xs text-stone-400">{authorName.get(r.createdById) ?? ""}</span>
                  </td>
                  {!sub && <td className="py-2.5 pr-3 text-stone-700">{r.subProjectId ? (subName.get(r.subProjectId) ?? "—") : "celý projekt"}</td>}
                  {r.sum ? (
                    <>
                      <td className="py-2.5 pr-3 text-right font-mono">{tis(r.sum.total)}</td>
                      <td className="py-2.5 pr-3 text-right font-mono">{tis(r.sum.remaining)}</td>
                      <td className="py-2.5 pr-3 text-right font-mono">
                        {r.sum.finalLow === r.sum.finalHigh ? `${mil(r.sum.finalLow)} mil.` : `${mil(r.sum.finalLow)}–${mil(r.sum.finalHigh)} mil.`}
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className={`py-2.5 pr-3 text-right text-xs ${r.failed ? "text-red-700" : "text-stone-500"}`}>
                      {r.running ? "připravuje se…" : r.failed ? (r.error ?? "nedoběhl") : "—"}
                    </td>
                  )}
                  <td className="py-2.5 pr-3">
                    {r.documentId ? (
                      <a
                        href={`/api/documents/${r.documentId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-stone-700 underline-offset-4 hover:text-stone-950 hover:underline"
                      >
                        <FileText className="size-4 text-stone-400" />
                        PDF
                        {docSize.get(r.documentId) ? <span className="text-xs text-stone-400">· {Math.round(docSize.get(r.documentId)! / 1024)} kB</span> : null}
                      </a>
                    ) : r.sum ? (
                      <Link href={`/report/${r.id}`} className="text-xs text-stone-500 hover:text-stone-950">
                        vytvoří se po otevření
                      </Link>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      <DeleteButton action={deleteCostReport} fields={{ id: r.id }} confirm="Smazat report i jeho PDF?" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
