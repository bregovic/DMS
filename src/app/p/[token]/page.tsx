import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { unitLabel } from "@/lib/constants";
import { getProjectRole, isManager } from "@/server/access";
import { readOfferFields, resolvePortalToken, tenderAcceptsOffers } from "@/server/tenders";
import { PortalOfferForm } from "@/components/portal/offer-form";
import { PortalGallery } from "@/components/portal/gallery";

export const metadata: Metadata = {
  title: "Poptávka",
  robots: { index: false, follow: false },
};

/**
 * Veřejná stránka poptávkového řízení (#49). Dodavatel tu vidí zadání
 * a podá nabídku. Z DMS ukazuje jen to, co je k řízení zveřejněné.
 */
export default async function PortalPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const ref = await resolvePortalToken(token);
  if (!ref) notFound();

  const t = await prisma.tender.findUnique({
    where: { id: ref.tenderId },
    select: {
      id: true,
      title: true,
      intro: true,
      location: true,
      contact: true,
      realization: true,
      deadline: true,
      status: true,
      projectId: true,
      requests: {
        orderBy: { sortOrder: "asc" },
        select: {
          request: {
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              unit: true,
              requiredDate: true,
              offerFields: true,
              documents: {
                where: { gallery: true },
                orderBy: { createdAt: "asc" },
                select: { id: true, originalName: true },
              },
            },
          },
        },
      },
    },
  });
  if (!t) notFound();

  // Správce řízení vidí i koncept – jako náhled.
  const session = await auth();
  const preview = session?.user?.id ? isManager(await getProjectRole(t.projectId, session.user)) : false;
  if (t.status === "draft" && !preview) notFound();

  const invite = ref.inviteId
    ? await prisma.tenderInvite.findUnique({ where: { id: ref.inviteId }, select: { id: true, name: true, email: true, openedAt: true, vendor: { select: { ico: true, phone: true } } } })
    : null;
  if (invite && !preview) {
    const now = new Date();
    await prisma.tenderInvite
      .update({ where: { id: invite.id }, data: { lastOpenedAt: now, ...(invite.openedAt ? {} : { openedAt: now }) } })
      .catch(() => undefined);
  }

  const open = tenderAcceptsOffers(t);
  // Správce v náhledu konceptu vidí formulář celý, jen odeslat půjde až po zveřejnění.
  const previewForm = !open && preview && t.status === "draft";
  const closedMsg =
    t.status === "cancelled"
      ? { h: "Řízení bylo zrušeno", p: "Děkujeme za zájem. Nabídky se už nepřijímají." }
      : { h: "Příjem nabídek skončil", p: "Děkujeme za zájem." };
  const items = t.requests.map(({ request: r }) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    quantity: r.quantity != null ? Number(r.quantity) : null,
    unit: r.unit,
    requiredDate: r.requiredDate,
    fields: readOfferFields(r.offerFields),
    photos: r.documents.map((d) => ({ src: `/api/p/${token}/img/${d.id}`, name: d.originalName })),
  }));

  const daysLeft = t.deadline ? Math.ceil((new Date(t.deadline).setUTCHours(23, 59, 59) - Date.now()) / 86_400_000) : null;
  const nItems = `${items.length} ${items.length === 1 ? "položka" : items.length < 5 ? "položky" : "položek"}`;
  const meta = [
    t.location && { k: "Místo", v: t.location },
    t.realization && { k: "Realizace", v: t.realization },
    { k: "Nabídky do", v: t.deadline ? formatDate(t.deadline) : "průběžně", badge: open && daysLeft != null && daysLeft >= 0 ? (daysLeft === 0 ? "dnes" : `zbývá ${daysLeft} ${daysLeft === 1 ? "den" : daysLeft < 5 ? "dny" : "dní"}`) : null },
    t.contact && { k: "Kontakt", v: t.contact },
  ].filter(Boolean) as { k: string; v: string; badge?: string | null }[];

  return (
    <div className="min-h-screen bg-[#f4f3f0] text-stone-900">
      {preview && t.status !== "open" && (
        <div className="bg-amber-400 px-4 py-2 text-center text-xs font-medium text-stone-950">
          Náhled · {t.status === "draft" ? "řízení není zveřejněné" : t.status === "cancelled" ? "řízení je zrušené" : "řízení je uzavřené"}
        </div>
      )}

      <header className="relative overflow-hidden bg-stone-950 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.18),transparent_65%)]" />
        <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400">
            Poptávka · {nItems}
            {invite ? ` · pro ${invite.name}` : ""}
          </p>
          <h1 className="display mt-4 max-w-3xl text-4xl leading-[1.02] sm:text-6xl">{t.title}</h1>
          {t.intro && <p className="mt-5 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-stone-300">{t.intro}</p>}

          <dl className="mt-9 grid grid-cols-1 gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {meta.map((m) => (
              <div key={m.k} className="bg-stone-950 px-4 py-3.5">
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">{m.k}</dt>
                <dd className="mt-1 text-[15px] text-white">
                  {m.v}
                  {m.badge && <span className="ml-2 bg-amber-400 px-1.5 py-0.5 align-middle text-[11px] font-medium text-stone-950">{m.badge}</span>}
                </dd>
              </div>
            ))}
          </dl>

          {(open || previewForm) && (
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href="#nabidka" className="inline-flex h-12 items-center bg-amber-400 px-6 text-[15px] font-medium text-stone-950 transition-colors hover:bg-amber-300">
                Podat nabídku ↓
              </a>
              <ol className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-400">
                {["Prohlédněte zadání", "Vyplňte cenu a údaje", "Stav sledujte pod kódem"].map((x, i) => (
                  <li key={x} className="flex items-center gap-1.5">
                    <span className="flex size-5 items-center justify-center rounded-full border border-stone-600 font-mono text-[10px] text-stone-300">{i + 1}</span>
                    {x}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-14">
        <h2 className="kicker mb-5">Zadání · {nItems}</h2>
        <ol className="space-y-8">
          {items.map((r, i) => (
            <li key={r.id} id={`polozka-${r.id}`} className="overflow-hidden border border-stone-300/80 bg-white shadow-[0_18px_40px_-30px_rgba(41,37,36,0.35)]">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
                <div className="p-5 sm:p-8">
                  <div className="flex items-start gap-4">
                    <span className="display flex size-11 shrink-0 items-center justify-center bg-stone-950 text-lg text-white">{i + 1}</span>
                    <h3 className="display pt-1 text-2xl leading-tight text-stone-950 sm:text-3xl">{r.title}</h3>
                  </div>
                  {(r.quantity != null || r.requiredDate) && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {r.quantity != null && (
                        <span className="border border-stone-300 bg-stone-50 px-3 py-1.5 text-sm">
                          <span className="text-stone-500">Množství </span>
                          <b className="font-mono font-medium text-stone-950">
                            {r.quantity.toLocaleString("cs-CZ")} {unitLabel(r.unit)}
                          </b>
                        </span>
                      )}
                      {r.requiredDate && (
                        <span className="border border-stone-300 bg-stone-50 px-3 py-1.5 text-sm">
                          <span className="text-stone-500">Potřebujeme do </span>
                          <b className="font-medium text-stone-950">{formatDate(r.requiredDate)}</b>
                        </span>
                      )}
                    </div>
                  )}
                  {r.description && (
                    <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-stone-800">{r.description}</p>
                  )}
                  {r.fields.length > 0 && (
                    <div className="mt-6 border-t border-stone-200 pt-4">
                      <p className="kicker">V nabídce prosíme uvést</p>
                      <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {r.fields.map((f, k) => (
                          <li key={k} className="flex items-start gap-2 text-sm text-stone-800">
                            <span className="mt-1.5 size-1.5 shrink-0 bg-amber-500" />
                            <span>
                              {f.label}
                              {f.unit ? <span className="text-stone-400"> [{f.unit}]</span> : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {r.photos.length > 0 && (
                  <div className="border-t border-stone-200 bg-stone-100 p-3 lg:border-l lg:border-t-0">
                    <PortalGallery photos={r.photos} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        <section id="nabidka" className="mt-14 scroll-mt-6">
          {open || previewForm ? (
            <PortalOfferForm
              previewOnly={previewForm}
              token={token}
              items={items.map((r) => ({ id: r.id, title: r.title, fields: r.fields }))}
              defaults={{
                email: invite?.email ?? "",
                ico: invite?.vendor?.ico ?? "",
                phone: invite?.vendor?.phone ?? "",
              }}
            />
          ) : (
            <div className="border border-stone-300/80 bg-white px-6 py-10 text-center">
              <p className="display text-3xl text-stone-950">{closedMsg.h}</p>
              <p className="mt-2 text-sm text-stone-600">{closedMsg.p}</p>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-300/80">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-stone-500 sm:px-8">
          <span>Odeslaná nabídka dostane kód, pod kterým lze sledovat její stav.</span>
          <span>Údaje z formuláře slouží jen pro toto řízení.</span>
        </div>
      </footer>
    </div>
  );
}
