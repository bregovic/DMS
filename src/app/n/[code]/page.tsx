import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { offerPriceLine, publicOfferStatus } from "@/server/tenders";
import { CopyButton } from "@/components/portal/copy-button";

export const metadata: Metadata = {
  title: "Stav nabídky",
  robots: { index: false, follow: false },
};

const BADGE: Record<string, string> = {
  received: "border-stone-300 text-stone-700",
  review: "border-stone-950 text-stone-950",
  won: "border-emerald-700 bg-emerald-700 text-white",
  lost: "border-stone-300 bg-stone-100 text-stone-500",
};

/** Stav podané nabídky pod kódem pro sledování (#49). */
export default async function TrackingPage({ params, searchParams }: PageProps<"/n/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const fresh = sp.nova === "1";
  const s = await prisma.tenderSubmission.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      code: true,
      companyName: true,
      email: true,
      createdAt: true,
      reply: true,
      replyPublishedAt: true,
      tender: { select: { title: true, token: true, status: true, deadline: true } },
      offers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          price: true,
          priceWithoutVat: true,
          vatRate: true,
          vatMode: true,
          status: true,
          selected: true,
          deliveryDate: true,
          request: { select: { title: true } },
          documents: { select: { originalName: true } },
        },
      },
    },
  });
  if (!s) notFound();
  const published = !!s.replyPublishedAt;

  return (
    <div className="min-h-screen bg-[#f4f3f0] text-stone-900">
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 sm:py-16">
        {fresh && (
          <div className="mb-8 border border-stone-950 bg-white px-5 py-5">
            <p className="display text-2xl text-stone-950">Děkujeme, nabídka je odeslaná.</p>
            <p className="mt-2 text-sm text-stone-600">
              Stav nabídky najdete na této stránce. Uložte si odkaz nebo kód.
            </p>
          </div>
        )}

        <p className="kicker">Stav nabídky</p>
        <h1 className="display mt-2 text-4xl leading-tight text-stone-950">{s.tender.title}</h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="border border-stone-950 bg-white px-3 py-1.5 font-mono text-lg tracking-widest text-stone-950">
            {s.code}
          </span>
          <CopyButton text={s.code} label="Kopírovat kód" />
          <CopyButton text="" useLocation label="Kopírovat odkaz" />
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="kicker">Dodavatel</dt>
            <dd className="mt-1 text-stone-950">{s.companyName}</dd>
          </div>
          <div>
            <dt className="kicker">Podáno</dt>
            <dd className="mt-1 text-stone-950">{formatDate(s.createdAt)}</dd>
          </div>
        </dl>

        <ul className="mt-8 border-t border-stone-300">
          {s.offers.map((o) => {
            const st = publicOfferStatus(o, published);
            return (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-stone-300 py-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-stone-950">{o.request.title}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {offerPriceLine(o)}
                    {o.deliveryDate ? ` · dodání ${formatDate(o.deliveryDate)}` : ""}
                    {o.documents.length ? ` · ${o.documents.map((d) => d.originalName).join(", ")}` : ""}
                  </p>
                </div>
                <span className={`border px-2 py-0.5 text-xs uppercase tracking-wide ${BADGE[st.key]}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>

        {published && s.reply && (
          <section className="mt-10 border border-stone-300/80 bg-white px-6 py-6">
            <p className="kicker">Odpověď · {formatDate(s.replyPublishedAt!)}</p>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-stone-800">{s.reply}</p>
          </section>
        )}

        {!published && (
          <p className="mt-8 text-sm text-stone-600">
            {s.tender.deadline && s.tender.status === "open"
              ? `Nabídky se přijímají do ${formatDate(s.tender.deadline)}. Výsledek se zobrazí zde.`
              : "Výsledek se zobrazí zde."}
          </p>
        )}

        {s.tender.status === "open" && (
          <Link
            href={`/p/${s.tender.token}`}
            className="mt-10 inline-block text-sm text-stone-600 underline underline-offset-4 hover:text-stone-950"
          >
            Zpět na poptávku
          </Link>
        )}
      </main>
    </div>
  );
}
