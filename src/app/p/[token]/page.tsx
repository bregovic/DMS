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
      criteria: true,
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

  return (
    <div className="min-h-screen bg-[#f4f3f0] text-stone-900">
      {preview && t.status !== "open" && (
        <div className="bg-stone-950 px-4 py-2 text-center text-xs text-white">
          Náhled · {t.status === "draft" ? "řízení není zveřejněné" : "řízení je uzavřené"}
        </div>
      )}

      <header className="border-b border-stone-300/80 bg-white">
        <div className="mx-auto max-w-4xl px-4 pb-10 pt-12 sm:px-8 sm:pt-16">
          <p className="kicker">Poptávka{invite ? ` · pro ${invite.name}` : ""}</p>
          <h1 className="display mt-3 text-4xl leading-[1.05] text-stone-950 sm:text-6xl">{t.title}</h1>
          <dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-4 text-sm sm:grid-cols-3">
            {t.location && (
              <div>
                <dt className="kicker">Místo</dt>
                <dd className="mt-1 text-stone-950">{t.location}</dd>
              </div>
            )}
            <div>
              <dt className="kicker">Nabídky do</dt>
              <dd className="mt-1 text-stone-950">{t.deadline ? formatDate(t.deadline) : "průběžně"}</dd>
            </div>
            {t.contact && (
              <div>
                <dt className="kicker">Kontakt</dt>
                <dd className="mt-1 text-stone-950">{t.contact}</dd>
              </div>
            )}
          </dl>
          {t.intro && <p className="mt-8 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-stone-700">{t.intro}</p>}
          {t.criteria && (
            <div className="mt-8 max-w-2xl">
              <p className="kicker">Podle čeho vybíráme</p>
              <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-stone-700">{t.criteria}</p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <h2 className="kicker mb-4">
          Zadání · {items.length} {items.length === 1 ? "položka" : items.length < 5 ? "položky" : "položek"}
        </h2>
        <ol className="space-y-6">
          {items.map((r, i) => (
            <li key={r.id} id={`polozka-${r.id}`} className="border border-stone-300/80 bg-white shadow-[0_1px_0_rgba(41,37,36,0.04)]">
              <div className="flex items-baseline gap-4 border-b border-stone-200 px-5 py-4 sm:px-7">
                <span className="font-mono text-xs text-stone-400">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="display flex-1 text-2xl text-stone-950">{r.title}</h3>
              </div>
              <div className="px-5 py-5 sm:px-7">
                <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  {r.quantity != null && (
                    <div>
                      <dt className="kicker">Množství</dt>
                      <dd className="mt-0.5 font-mono text-stone-950">
                        {r.quantity.toLocaleString("cs-CZ")} {unitLabel(r.unit)}
                      </dd>
                    </div>
                  )}
                  {r.requiredDate && (
                    <div>
                      <dt className="kicker">Potřebujeme do</dt>
                      <dd className="mt-0.5 text-stone-950">{formatDate(r.requiredDate)}</dd>
                    </div>
                  )}
                </dl>
                {r.description && (
                  <div className="mt-4">
                    <p className="kicker">Specifikace</p>
                    <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-stone-800">{r.description}</p>
                  </div>
                )}
                {r.photos.length > 0 && <PortalGallery photos={r.photos} />}
                {r.fields.length > 0 && (
                  <div className="mt-5">
                    <p className="kicker">V nabídce prosíme uvést</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.fields.map((f, k) => (
                        <li key={k} className="border border-stone-300 px-2 py-0.5 text-xs text-stone-700">
                          {f.label}
                          {f.unit ? ` [${f.unit}]` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12">
          {open ? (
            <PortalOfferForm
              token={token}
              items={items.map((r) => ({ id: r.id, title: r.title, fields: r.fields }))}
              defaults={{
                email: invite?.email ?? "",
                ico: invite?.vendor?.ico ?? "",
                phone: invite?.vendor?.phone ?? "",
              }}
            />
          ) : (
            <div className="border border-stone-300/80 bg-white px-6 py-8 text-center">
              <p className="display text-2xl text-stone-950">Příjem nabídek skončil</p>
              <p className="mt-2 text-sm text-stone-600">Děkujeme za zájem.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-12 text-xs text-stone-400 sm:px-8">
        Odeslaná nabídka dostane kód, pod kterým lze sledovat její stav.
      </footer>
    </div>
  );
}
