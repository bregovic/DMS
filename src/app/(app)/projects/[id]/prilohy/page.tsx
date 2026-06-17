import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getProjectAttachments } from "@/server/attachments";
import { formatCurrency, formatDate } from "@/lib/utils";

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

  const total = res.items.reduce((s, i) => s + i.amount, 0);
  const totalSize = res.items.reduce((s, i) => s + i.size, 0);

  const zipParams = new URLSearchParams();
  if (sub) zipParams.set("sub", sub);
  if (from) zipParams.set("from", from);
  if (to) zipParams.set("to", to);
  const zipHref = `/api/projects/${id}/documents/zip${zipParams.toString() ? `?${zipParams}` : ""}`;
  const backHref = `/projects/${id}${sub ? `?sub=${sub}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={backHref} className="kicker text-stone-400 hover:text-stone-950">
        ← {res.subName ?? res.projectName}
      </Link>

      <header className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-3xl text-stone-950">Přílohy</h1>
          <p className="mt-1 text-sm text-stone-500">
            {res.subName ? `Složka ${res.subName}` : `Projekt ${res.projectName}`} ·{" "}
            {res.items.length} {res.items.length === 1 ? "soubor" : "souborů"} ·{" "}
            {formatBytes(totalSize)} · výdaje {formatCurrency(total)}
          </p>
        </div>
        {res.items.length > 0 && (
          <a
            href={zipHref}
            className="flex items-center gap-2 bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            <Download className="size-4" />
            Stáhnout vše (ZIP)
          </a>
        )}
      </header>

      {/* Filtr období (podle data výdaje) */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        {sub && <input type="hidden" name="sub" value={sub} />}
        <div className="space-y-1">
          <label className="kicker block" htmlFor="from">Od</label>
          <input
            id="from" type="date" name="from" defaultValue={from}
            className="border border-stone-300 px-3 py-2 text-sm focus:border-stone-950 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="kicker block" htmlFor="to">Do</label>
          <input
            id="to" type="date" name="to" defaultValue={to}
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
        <ul className="border-t border-stone-200">
          {res.items.map((it) => (
            <li
              key={it.docId}
              className="flex items-center justify-between gap-3 border-b border-stone-200 py-3"
            >
              <a
                href={`/api/documents/${it.docId}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-3 group"
              >
                <FileText className="size-4 shrink-0 text-stone-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-stone-950 underline-offset-4 group-hover:underline">
                    {it.originalName}
                  </span>
                  <span className="kicker mt-0.5 block">
                    {it.expenseTitle} · {formatDate(it.date)} · {formatCurrency(it.amount)} ·{" "}
                    {formatBytes(it.size)}
                  </span>
                </span>
              </a>
              <a
                href={`/api/documents/${it.docId}`}
                download
                className="shrink-0 text-stone-400 transition-colors hover:text-stone-950"
                title="Stáhnout"
              >
                <Download className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
