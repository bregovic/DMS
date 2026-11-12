import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { getProjectAccess, isManager } from "@/server/access";
import { tenderStatusLabel } from "@/server/tenders";
import { createTender } from "@/server/actions/tenders";
import { requestStatusLabel } from "@/lib/constants";

const CLOSED = ["objednano", "schvaleno", "zruseno"];

/** Poptávková řízení projektu / složky (#49). */
export default async function TendersPage({
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

  // složka i s podsložkami
  const subs = await prisma.subProject.findMany({ where: { projectId: id }, select: { id: true, name: true, parentId: true } });
  const scopeIds = new Set<string>();
  if (sub) {
    const walk = (pid: string) => {
      scopeIds.add(pid);
      for (const s of subs) if (s.parentId === pid) walk(s.id);
    };
    walk(sub);
  }

  const [project, tenders, requests] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { name: true } }),
    prisma.tender.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        deadline: true,
        createdAt: true,
        requests: { select: { request: { select: { subProjectId: true } } } },
        _count: { select: { requests: true, invites: true, submissions: true } },
      },
    }),
    prisma.request.findMany({
      where: { projectId: id, status: { notIn: CLOSED }, ...(sub ? { subProjectId: { in: [...scopeIds] } } : {}) },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, status: true, subProjectId: true, _count: { select: { offers: true } } },
    }),
  ]);
  if (!project) notFound();
  const subName = new Map(subs.map((s) => [s.id, s.name]));
  if (sub && !subName.has(sub)) notFound();
  const shown = sub
    ? tenders.filter((t) => t.requests.some((r) => r.request.subProjectId && scopeIds.has(r.request.subProjectId)))
    : tenders;
  const backHref = `/projects/${id}?tab=zadanky${sub ? `&sub=${sub}` : ""}`;
  const scope = sub ? subName.get(sub)! : project.name;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={backHref} className="kicker text-stone-400 hover:text-stone-950">
        ← {scope}
      </Link>
      <header className="mb-6 mt-2 border-b border-stone-300/80 pb-6">
        <h1 className="display text-3xl text-stone-950">Poptávková řízení</h1>
        <p className="mt-1 text-sm text-stone-500">
          {sub ? `Složka ${scope}` : `Projekt ${scope}`} · {shown.length}
        </p>
      </header>

      {shown.length === 0 ? (
        <p className="py-8 text-sm text-stone-500">Zatím žádné řízení.</p>
      ) : (
        <ul className="mb-12 border-t border-stone-200">
          {shown.map((t) => (
            <li key={t.id} className="border-b border-stone-200">
              <Link
                href={`/projects/${id}/rizeni/${t.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3.5 hover:bg-white/60"
              >
                <span className="min-w-0">
                  <span className="text-sm font-medium text-stone-950">{t.title}</span>
                  <span className="kicker mt-0.5 block">
                    {t._count.requests} {t._count.requests === 1 ? "žádanka" : t._count.requests < 5 ? "žádanky" : "žádanek"}
                    {` · oslovено ${t._count.invites} · nabídek ${t._count.submissions}`}
                    {t.deadline ? ` · do ${formatDate(t.deadline)}` : ""}
                  </span>
                </span>
                <span
                  className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    t.status === "open" ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-500"
                  }`}
                >
                  {tenderStatusLabel(t.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="border border-stone-300/80 bg-white p-5 sm:p-7">
        <h2 className="display text-xl text-stone-950">Nové řízení</h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">Žádné otevřené žádanky.</p>
        ) : (
          <form action={createTender} className="mt-4 space-y-4">
            <input type="hidden" name="projectId" value={id} />
            {sub && <input type="hidden" name="subProjectId" value={sub} />}
            <div>
              <label className="kicker mb-1.5 block" htmlFor="t-title">
                Název
              </label>
              <input
                id="t-title"
                name="title"
                placeholder="podle žádanek"
                className="flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none"
              />
            </div>
            <fieldset>
              <legend className="kicker mb-1.5">Žádanky</legend>
              <ul className="max-h-80 overflow-y-auto border border-stone-200">
                {requests.map((r) => (
                  <li key={r.id} className="border-b border-stone-100 last:border-0">
                    <label className="flex cursor-pointer items-baseline gap-3 px-3 py-2.5 hover:bg-stone-50">
                      <input type="checkbox" name="requestId" value={r.id} className="size-4 translate-y-0.5 accent-stone-950" />
                      <span className="min-w-0 flex-1 text-sm text-stone-900">{r.title}</span>
                      <span className="shrink-0 text-xs text-stone-500">
                        {r.subProjectId && !sub ? `${subName.get(r.subProjectId) ?? ""} · ` : ""}
                        {requestStatusLabel(r.status)}
                        {r._count.offers ? ` · ${r._count.offers} nab.` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <button
              type="submit"
              className="inline-flex h-10 items-center bg-stone-950 px-5 text-sm font-medium text-white hover:bg-stone-800 cursor-pointer"
            >
              Založit řízení
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
