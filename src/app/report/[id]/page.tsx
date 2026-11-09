import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager } from "@/server/access";
import type { ReportData, ReportResult } from "@/server/cost-report";
import { CostReportView } from "@/components/reports/cost-report-view";
import { CostReportToolbar } from "@/components/reports/cost-report-toolbar";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { after } from "next/server";
import { claimOrphanedReport, runCostReport } from "@/server/cost-report";

export const metadata: Metadata = { title: "Report nákladů – DMS" };

// Běh, který po restartu serveru nedoběhl, se po 20 minutách bere jako chyba.
const STALE_MS = 20 * 60_000;
const isStale = (createdAt: Date) => Date.now() - createdAt.getTime() > STALE_MS;

export default async function CostReportPage({ params }: PageProps<"/report/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const r = await prisma.costReport.findUnique({
    where: { id },
    select: {
      id: true, projectId: true, subProjectId: true, status: true, prompt: true, data: true, result: true,
      error: true, documentId: true, createdAt: true, responseId: true,
      project: { select: { name: true } },
    },
  });
  if (!r || !isManager(await getProjectRole(r.projectId, user))) notFound();

  // Server se během zpracování restartoval (nasazení) – navázat na úlohu u OpenAI.
  if (r.status === "running" && r.responseId && !isStale(r.createdAt) && (await claimOrphanedReport(r.id)))
    after(() => runCostReport(r.id));
  const stale = r.status === "running" && isStale(r.createdAt);
  const running = r.status === "running" && !stale;
  const data = r.data as unknown as ReportData | null;
  const result = r.status === "ready" ? (r.result as unknown as ReportResult) : null;
  const error = stale ? "zpracování nedoběhlo" : r.status === "error" ? r.error : null;
  const backHref = `/projects/${r.projectId}/reporty${r.subProjectId ? `?sub=${r.subProjectId}` : ""}`;
  const day = r.createdAt.toISOString().slice(0, 10);
  const fileName = `Report nákladů – ${(data?.scopeName ?? r.project.name).replace(/[\\/:*?"<>|]+/g, " ")} ${day}.pdf`;

  return (
    <div className="min-h-screen bg-stone-100 pb-10">
      <AutoRefresh when={running} ms={5000} />
      <CostReportToolbar
        id={r.id}
        backHref={backHref}
        fileName={fileName}
        prompt={r.prompt}
        documentId={r.documentId}
        ready={r.status === "ready" && !!data}
      />
      {running ? (
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="text-sm font-medium text-stone-950">Připravuji report…</p>
          <p className="mt-1 text-sm text-stone-500">Rozřazení výdajů a srovnání cen trvá obvykle 3–6 minut.</p>
        </div>
      ) : data ? (
        <CostReportView data={data} result={result} error={error} />
      ) : (
        <p className="mx-auto max-w-md px-4 py-24 text-center text-sm text-red-700">{error ?? "Report se nepodařilo připravit."}</p>
      )}
    </div>
  );
}
