import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { requestStatusLabel } from "@/lib/constants";
import { getProjectAccess, isManager } from "@/server/access";
import {
  inviteEmail,
  offerPriceLine,
  portalLink,
  readOfferFields,
  replyEmail,
  replyText,
  tenderAcceptsOffers,
  tenderStatusLabel,
  trackingLink,
  vendorTenderStats,
} from "@/server/tenders";
import { deleteTender, setTenderRequests, setTenderStatus } from "@/server/actions/tenders";
import { CopyButton } from "@/components/portal/copy-button";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { TenderSuggest, type SuggestionView } from "@/components/tenders/tender-suggest";
import { WeightsEditor } from "@/components/tenders/tender-fields";
import type { TenderSuggestion } from "@/server/tender-ai";
import { DeleteButton } from "@/components/ui/delete-button";
import {
  EmailDraft,
  GalleryManager,
  InviteAdder,
  InviteRowActions,
  ReplyForm,
  RequestBriefForm,
  TenderSettingsForm,
} from "@/components/tenders/tender-admin";

const CLOSED = ["objednano", "schvaleno", "zruseno"];

function statsLabel(s: { invited: number; answered: number; won: number } | undefined) {
  if (!s || !s.invited) return null;
  return `osloven ${s.invited}× · odpověděl ${s.answered}× · vybrán ${s.won}×`;
}

/** Detail poptávkového řízení (#49): nastavení, zadání, pozvánky, nabídky. */
export default async function TenderPage({ params }: { params: Promise<{ id: string; tid: string }> }) {
  const user = await requireUser();
  const { id, tid } = await params;
  const access = await getProjectAccess(id, user);
  if (!access || !isManager(access.role)) notFound();

  const t = await prisma.tender.findFirst({
    where: { id: tid, projectId: id },
    include: {
      project: { select: { name: true, ownerId: true } },
      requests: {
        orderBy: { sortOrder: "asc" },
        include: {
          request: {
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              unit: true,
              requiredDate: true,
              offerFields: true,
              status: true,
              documents: { where: { gallery: true }, orderBy: { createdAt: "asc" }, select: { id: true, originalName: true } },
            },
          },
        },
      },
      invites: {
        orderBy: { createdAt: "asc" },
        include: { vendor: { select: { ico: true } } },
      },
      submissions: {
        orderBy: { createdAt: "desc" },
        include: {
          offers: {
            orderBy: { createdAt: "asc" },
            include: {
              request: { select: { id: true, title: true } },
              documents: { select: { id: true, originalName: true } },
            },
          },
        },
      },
    },
  });
  if (!t) notFound();

  const sender = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  const senderInfo = { name: sender?.name ?? null, contact: t.contact };

  const [projectRequests, vendors] = await Promise.all([
    prisma.request.findMany({
      where: { projectId: id, OR: [{ status: { notIn: CLOSED } }, { tenders: { some: { tenderId: t.id } } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, status: true },
    }),
    prisma.vendor.findMany({
      where: { ownerId: t.project.ownerId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, category: true },
    }),
  ]);
  const stats = await vendorTenderStats(vendors.map((v) => v.id));
  const invitedVendorIds = new Set(t.invites.map((i) => i.vendorId).filter(Boolean));

  const link = portalLink(t.token);
  const accepting = tenderAcceptsOffers(t);
  const included = new Set(t.requests.map((r) => r.requestId));
  const requestTitles = t.requests.map((r) => r.request.title);
  const mailBase = { title: t.title, location: t.location, deadline: t.deadline, requests: requestTitles };
  const generic = inviteEmail(mailBase, link, senderInfo);
  const unsent = t.invites.filter((i) => !i.sentAt).length;
  // Odpověď osloveného: podle pozvánky, dodavatele, e-mailu nebo IČO.
  const submissionOf = (inv: (typeof t.invites)[number]) =>
    t.submissions.find(
      (s) =>
        s.inviteId === inv.id ||
        (inv.vendorId && s.vendorId === inv.vendorId) ||
        (inv.email && s.email.toLowerCase() === inv.email.toLowerCase()) ||
        (inv.vendor?.ico && s.ico === inv.vendor.ico),
    );
  const back = `/projects/${id}/rizeni`;
  const savedWeights = Array.isArray(t.weights) ? (t.weights as { label: string; weight: number; note?: string }[]) : [];
  // Návrh dodavatelů: běh starší 15 min bez výsledku se bere jako chyba.
  const aiRunning = t.aiStatus === "running" && Date.now() - t.updatedAt.getTime() < 30 * 60_000;
  const aiStatus = aiRunning ? "running" : t.aiStatus === "running" ? "error" : ((t.aiStatus ?? "idle") as "idle" | "ready" | "error");
  const raw = t.aiResult as TenderSuggestion | null;
  const reqTitle = new Map(t.requests.map((r) => [r.requestId, r.request.title]));
  const suggestion: SuggestionView | null = raw
    ? {
        note: raw.note ?? null,
        criteria: raw.criteria ?? [],
        requests: (raw.requests ?? []).map((r) => ({
          requestId: r.requestId,
          title: reqTitle.get(r.requestId) ?? "",
          offerFields: (r.offerFields ?? []).map((f) => ({ label: f.label, unit: f.unit ?? null, required: !!f.required })),
          gaps: r.gaps ?? [],
        })),
        vendors: (raw.vendors ?? []).map((v) => ({
          name: v.name,
          ico: v.ico,
          web: v.web,
          email: v.email,
          phone: v.phone,
          city: v.city,
          rating: v.rating,
          ratingCount: v.ratingCount,
          ratingSource: v.ratingSource,
          references: v.references,
          why: v.why,
          aresName: v.aresName ?? null,
          aresOk: !!v.aresOk,
          vendorId: v.vendorId ?? null,
          invited: t.invites.some(
            (i) => (v.vendorId && i.vendorId === v.vendorId) || (v.email && i.email?.toLowerCase() === v.email),
          ),
          forRequests: (v.requestIds ?? []).map((x) => reqTitle.get(x) ?? "").filter(Boolean),
        })),
      }
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={back} className="kicker text-stone-400 hover:text-stone-950">
        ← Poptávková řízení · {t.project.name}
      </Link>

      <header className="mb-8 mt-2 border-b border-stone-300/80 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display text-3xl text-stone-950">{t.title}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {tenderStatusLabel(t.status)}
              {t.status === "open" && !accepting ? " · po termínu" : ""}
              {t.deadline ? ` · nabídky do ${formatDate(t.deadline)}` : ""}
              {` · ${t.submissions.length} ${t.submissions.length === 1 ? "nabídka" : t.submissions.length > 1 && t.submissions.length < 5 ? "nabídky" : "nabídek"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {t.status !== "open" && (
              <form action={setTenderStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value="open" />
                <button className="inline-flex h-9 items-center bg-stone-950 px-4 text-sm font-medium text-white hover:bg-stone-800 cursor-pointer">
                  {t.status === "draft" ? "Zveřejnit" : "Znovu otevřít"}
                </button>
              </form>
            )}
            {t.status === "open" && (
              <form action={setTenderStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value="closed" />
                <button className="inline-flex h-9 items-center border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:border-stone-950 hover:text-stone-950 cursor-pointer">
                  Uzavřít příjem nabídek
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border border-stone-200 bg-white px-3 py-2">
          <span className="kicker">Odkaz</span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-stone-700">{link}</code>
          <CopyButton text={link} label="Kopírovat" />
          <a
            href={`/p/${t.token}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 hover:border-stone-950 hover:text-stone-950"
          >
            <ExternalLink className="size-3.5" />
            {t.status === "draft" ? "Náhled" : "Otevřít"}
          </a>
          <EmailDraft to={null} subject={generic.subject} body={generic.body} trigger="Text e-mailu" />
        </div>
      </header>

      {/* Nabídky */}
      <section className="mb-12">
        <h2 className="kicker mb-3">Podané nabídky · {t.submissions.length}</h2>
        {t.submissions.length === 0 ? (
          <p className="text-sm text-stone-500">Zatím žádná nabídka.</p>
        ) : (
          <ul className="space-y-4">
            {t.submissions.map((s) => {
              const won = s.offers.map((o) => ({ title: o.request.title, won: o.selected || o.status === "vybrana" }));
              const draft = replyText(won, senderInfo);
              const mail = replyEmail(t.title, s.reply ?? draft, trackingLink(s.code));
              return (
                <li key={s.id} className="border border-stone-300/80 bg-white">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-950">{s.companyName}</p>
                      <p className="kicker mt-0.5">
                        {[s.ico ? `IČO ${s.ico}` : null, s.email, s.phone, formatDate(s.createdAt), s.code].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <a href={`/n/${s.code}`} target="_blank" rel="noreferrer" className="text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline">
                      Stránka dodavatele
                    </a>
                  </div>
                  <ul className="divide-y divide-stone-100 px-5">
                    {s.offers.map((o) => {
                      const params = Array.isArray(o.params) ? (o.params as { label: string; value: string }[]) : [];
                      const sel = o.selected || o.status === "vybrana";
                      return (
                        <li key={o.id} className="py-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <Link
                              href={`/projects/${id}?tab=zadanky#r-${o.request.id}`}
                              className="text-sm text-stone-900 underline-offset-2 hover:underline"
                            >
                              {o.request.title}
                            </Link>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-sm text-stone-950">{offerPriceLine(o)}</span>
                              {sel && <span className="border border-emerald-700 bg-emerald-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">vybraná</span>}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-stone-500">
                            {[
                              o.deliveryDate ? `dodání ${formatDate(o.deliveryDate)}` : null,
                              o.validUntil ? `platnost do ${formatDate(o.validUntil)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {params.length > 0 && (
                            <dl className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                              {params.map((p, k) => (
                                <div key={k} className="flex gap-2">
                                  <dt className="text-stone-500">{p.label}:</dt>
                                  <dd className="text-stone-900">{p.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {o.note && <p className="mt-1 whitespace-pre-line text-xs text-stone-600">{o.note}</p>}
                          {o.documents.length > 0 && (
                            <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                              {o.documents.map((d) => (
                                <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-950">
                                  <FileText className="size-3.5" />
                                  {d.originalName}
                                </a>
                              ))}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="space-y-3 border-t border-stone-200 bg-stone-50/60 px-5 py-4">
                    <ReplyForm submissionId={s.id} reply={s.reply} draft={draft} published={!!s.replyPublishedAt} />
                    <EmailDraft to={s.email} subject={mail.subject} body={mail.body} trigger="Odpověď e-mailem" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {t.submissions.length > 0 && (
          <p className="mt-3 text-xs text-stone-500">Vítěze vyber u žádanky.</p>
        )}
      </section>

      {/* Návrh dodavatelů a kritérií */}
      <section className="mb-12">
        <AutoRefresh when={aiRunning} ms={10000} />
        <h2 className="kicker mb-3">Návrh dodavatelů a kritérií</h2>
        <div className="border border-stone-300/80 bg-white p-5">
          <TenderSuggest tenderId={t.id} status={aiStatus} error={t.aiError} prompt={t.aiPrompt} result={suggestion} />
        </div>
      </section>

      {/* Kritéria výběru – jen pro zadavatele; bez uložených se předvyplní z návrhu */}
      <section className="mb-12">
        <h2 className="kicker mb-3">Kritéria výběru</h2>
        <div className="border border-stone-300/80 bg-white p-5">
          <WeightsEditor
            key={`${JSON.stringify(t.weights ?? null)}-${t.aiAt?.toISOString() ?? ""}`}
            tenderId={t.id}
            initial={savedWeights.length ? savedWeights : (suggestion?.criteria ?? []).map((c) => ({ label: c.label, weight: Math.round(c.weight), note: c.note }))}
            fromSuggestion={!savedWeights.length && !!suggestion?.criteria.length}
          />
        </div>
      </section>

      {/* Pozvánky */}
      <section className="mb-12">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="kicker">Oslovení dodavatelé · {t.invites.length}</h2>
          <InviteAdder
            tenderId={t.id}
            vendors={vendors
              .filter((v) => !invitedVendorIds.has(v.id))
              .map((v) => ({ ...v, stats: statsLabel(stats.get(v.id)) }))}
          />
        </div>
        {t.invites.length === 0 ? (
          <p className="text-sm text-stone-500">Zatím nikdo.</p>
        ) : (
          <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <EmailDraft
              to={t.invites.map((i) => i.email).filter(Boolean).join(", ") || null}
              toLabel="Komu (skrytá kopie)"
              subject={generic.subject}
              body={generic.body}
              trigger="Pozvánka pro všechny"
              markSent={unsent > 0 ? { tenderId: t.id, count: unsent } : undefined}
            />
          </div>
          <ul className="border-t border-stone-200">
            {t.invites.map((inv) => {
              const sub = submissionOf(inv);
              const state = sub
                ? { text: `nabídka ${formatDate(sub.createdAt)}`, cls: "border-emerald-700 text-emerald-800" }
                : inv.sentAt && !accepting
                  ? { text: "nereagoval", cls: "border-amber-600 text-amber-800" }
                  : inv.sentAt
                    ? { text: `odesláno ${formatDate(inv.sentAt)}`, cls: "border-stone-400 text-stone-600" }
                    : { text: "neodesláno", cls: "border-stone-300 text-stone-500" };
              const st = inv.vendorId ? statsLabel(stats.get(inv.vendorId)) : null;
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-stone-900">{inv.name}</p>
                    <p className="text-xs text-stone-500">
                      {inv.email ?? "bez e-mailu"}
                      {st ? ` · ${st}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${state.cls}`}>{state.text}</span>
                    <InviteRowActions inviteId={inv.id} sent={!!inv.sentAt} />
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </section>

      {/* Zadání */}
      <section className="mb-12">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="kicker">Zadání · {t.requests.length}</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline">
              Změnit žádanky
            </summary>
            <form action={setTenderRequests} className="absolute right-0 z-10 mt-2 w-[min(90vw,420px)] border border-stone-300 bg-white p-3 shadow-lg">
              <input type="hidden" name="id" value={t.id} />
              <ul className="max-h-72 overflow-y-auto">
                {projectRequests.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-baseline gap-2 px-1 py-1.5 text-sm hover:bg-stone-50">
                      <input type="checkbox" name="requestId" value={r.id} defaultChecked={included.has(r.id)} className="size-4 translate-y-0.5 accent-stone-950" />
                      <span className="flex-1">{r.title}</span>
                      <span className="text-xs text-stone-400">{requestStatusLabel(r.status)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button className="mt-2 inline-flex h-9 items-center bg-stone-950 px-4 text-sm font-medium text-white hover:bg-stone-800 cursor-pointer">
                Uložit
              </button>
            </form>
          </details>
        </div>
        <ol className="space-y-4">
          {t.requests.map(({ request: r }, i) => (
            <li key={r.id} className="border border-stone-300/80 bg-white">
              <div className="flex items-baseline gap-3 border-b border-stone-200 px-5 py-3">
                <span className="font-mono text-xs text-stone-400">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="flex-1 text-sm font-medium text-stone-950">{r.title}</h3>
                <span className="text-xs text-stone-500">{requestStatusLabel(r.status)}</span>
              </div>
              <div className="space-y-6 px-5 py-4">
                <RequestBriefForm
                  key={`${r.id}-${t.aiAt?.toISOString() ?? ""}`}
                  tenderId={t.id}
                  request={{
                    id: r.id,
                    description: r.description,
                    quantity: r.quantity != null ? Number(r.quantity) : null,
                    unit: r.unit,
                    requiredDate: r.requiredDate ? r.requiredDate.toISOString().slice(0, 10) : null,
                    fields: readOfferFields(r.offerFields).map((f) => ({ label: f.label, unit: f.unit ?? null, required: !!f.required })),
                    suggestedFields:
                      suggestion?.requests.find((x) => x.requestId === r.id)?.offerFields ?? [],
                  }}
                />
                <GalleryManager
                  tenderId={t.id}
                  requestId={r.id}
                  photos={r.documents.map((d) => ({ id: d.id, name: d.originalName }))}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Nastavení */}
      <section className="mb-12">
        <h2 className="kicker mb-3">Nastavení řízení</h2>
        <div className="border border-stone-300/80 bg-white p-5">
          <TenderSettingsForm
            tender={{
              id: t.id,
              title: t.title,
              intro: t.intro,
              location: t.location,
              contact: t.contact,
              deadline: t.deadline ? t.deadline.toISOString().slice(0, 10) : null,
              realization: t.realization,
            }}
          />
        </div>
        <div className="mt-4">
          <DeleteButton
            action={deleteTender}
            fields={{ id: t.id }}
            label="Smazat řízení"
            confirm="Smazat řízení? Odkazy přestanou fungovat, podané nabídky zůstanou u žádanek."
            className="inline-flex items-center text-xs text-stone-400 hover:text-red-700 cursor-pointer"
          />
        </div>
      </section>
    </div>
  );
}
