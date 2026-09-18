import Link from "next/link";
import { DateInput } from "@/components/ui/date-input";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getProjectAttachments } from "@/server/attachments";
import { formatCurrency, formatDate } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, isManager } from "@/server/access";
import { getDocumentTypes } from "@/server/document-types";
import { UploadForm } from "@/components/documents/upload-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteDocument } from "@/server/actions/documents";
import { FileText } from "lucide-react";
import { DocumentNote } from "@/components/documents/document-note";
import {
  AttachmentsBrowser,
  type BrowserItem,
} from "@/components/expenses/attachments-browser";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AttachmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const sub = typeof sp?.sub === "string" ? sp.sub : null;
  const from = typeof sp?.from === "string" ? sp.from : "";
  const to = typeof sp?.to === "string" ? sp.to : "";

  const fromD = from ? new Date(from) : null;
  let toD: Date | null = to ? new Date(to) : null;
  if (toD && !isNaN(toD.getTime())) toD.setHours(23, 59, 59, 999);
  else toD = null;

  const res = await getProjectAttachments(id, user, {
    sub,
    from: fromD && !isNaN(fromD.getTime()) ? fromD : null,
    to: toD,
  });
  if (!res) notFound();

  // Dokumentace projektu (technická zpráva, výkresy, smlouvy…) – soubory, které
  // nepatří k výdaji, žádance ani nabídce. Dřív se nahrávaly jen v záložce
  // Dokumenty a tady na stránce Přílohy nešly vůbec přidat.
  const access = await getProjectAccess(id, user);
  const canUpload = !sub && isManager(access?.role);
  const [projectDocs, docTypes] = sub
    ? [[], []]
    : await Promise.all([
        prisma.document.findMany({
          where: { projectId: id, expenseId: null, requestId: null, offerId: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, originalName: true, size: true, type: true, createdAt: true, note: true },
        }),
        getDocumentTypes(),
      ]);
  const typeLabel = new Map(docTypes.map((t) => [t.value, t.label]));

  const total = res.items.reduce((s, i) => s + i.amount, 0);
  const totalSize = res.items.reduce((s, i) => s + i.size, 0);
  const exportedCount = res.items.filter((i) => i.exported).length;

  const browserItems: BrowserItem[] = res.items.map((it) => ({
    docId: it.docId,
    originalName: it.originalName,
    metaLabel: `${it.expenseTitle} · ${formatDate(it.date)} · ${formatCurrency(it.amount)} · ${formatBytes(it.size)}`,
    exported: it.exported,
  }));

  const backHref = `/projects/${id}${sub ? `?sub=${sub}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={backHref} className="kicker text-stone-400 hover:text-stone-950">
        ← {res.subName ?? res.projectName}
      </Link>

      <header className="mb-6 mt-2 border-b border-stone-300/80 pb-6">
        <h1 className="display text-3xl text-stone-950">Přílohy</h1>
        <p className="mt-1 text-sm text-stone-500">
          {res.subName ? `Složka ${res.subName}` : `Projekt ${res.projectName}`} ·{" "}
          {res.items.length} {res.items.length === 1 ? "soubor" : "souborů"} ·{" "}
          {formatBytes(totalSize)} · výdaje {formatCurrency(total)}
          {exportedCount > 0 ? ` · ${exportedCount} staženo` : ""}
        </p>
      </header>

      {!sub && (
        <section className="mb-10">
          <h2 className="kicker mb-3">Dokumentace projektu · {projectDocs.length}</h2>
          {canUpload && <UploadForm projectId={id} types={docTypes} />}
          {projectDocs.length > 0 && (
            <ul className="mt-3">
              {projectDocs.map((d) => (
                <li key={d.id} className="group border-b border-stone-200 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-stone-400" />
                  <a
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-stone-900 underline-offset-4 hover:underline"
                  >
                    {d.originalName}
                  </a>
                  <span className="shrink-0 text-xs text-stone-400">
                    {typeLabel.get(d.type) ?? d.type} · {formatBytes(d.size)} · {formatDate(d.createdAt)}
                  </span>
                  {canUpload && (
                    <span className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      <DeleteButton action={deleteDocument} fields={{ id: d.id }} confirm="Smazat tento dokument?" />
                    </span>
                  )}
                  </div>
                  <div className="pl-6">
                    <DocumentNote id={d.id} note={d.note} canEdit={canUpload} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h2 className="kicker mb-3 mt-10">Účtenky a doklady k výdajům</h2>
        </section>
      )}

      {/* Filtr období (podle data výdaje) */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        {sub && <input type="hidden" name="sub" value={sub} />}
        <div className="space-y-1">
          <label className="kicker block" htmlFor="from">Od</label>
          <DateInput
            id="from" name="from" defaultValue={from}
            className="border border-stone-300 px-3 py-2 text-sm focus:border-stone-950 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="kicker block" htmlFor="to">Do</label>
          <DateInput
            id="to" name="to" defaultValue={to}
            className="border border-stone-300 px-3 py-2 text-sm focus:border-stone-950 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="border border-stone-300 px-4 py-2 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
        >
          Filtrovat
        </button>
        {(from || to) && (
          <Link href={`/projects/${id}/prilohy${sub ? `?sub=${sub}` : ""}`} className="px-2 py-2 text-sm text-stone-500 hover:text-stone-950">
            Zrušit
          </Link>
        )}
      </form>

      {res.items.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">
          {from || to
            ? "Pro zadané období nejsou žádné přílohy."
            : "K výdajům v této úrovni zatím nejsou žádné přílohy."}
        </p>
      ) : (
        <AttachmentsBrowser
          projectId={id}
          items={browserItems}
          sub={sub}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}
