import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { mailboxConfigured } from "@/lib/mailbox";
import { MailInbox, type MailView } from "@/components/mail/mail-inbox";

/**
 * Doručená pošta (#41): vstupní rozřazovací složka.
 *
 * Ve výchozím pohledu je jen to, co čeká na zařazení. Zpracované a
 * odmítnuté zprávy se schovají – jinak seznam narůstá o věci, se kterými
 * už není co dělat (dvakrát přeposlaná nabídka se odmítne jako duplicita
 * a zbytečně by tu zůstala viset).
 */
export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ vse?: string }>;
}) {
  const user = await requireUser();
  const vse = (await searchParams).vse === "1";
  const [mails, projects] = await Promise.all([
    prisma.inboundMail.findMany({
      where: { ownerId: user.id, ...(vse ? {} : { status: "nova" }) },
      orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        fromName: true,
        fromAddress: true,
        subject: true,
        receivedAt: true,
        bodyText: true,
        status: true,
        note: true,
        projectId: true,
        subProjectId: true,
        requestId: true,
        suggestion: true,
        attachments: {
          select: { id: true, originalName: true, size: true, kind: true, documentId: true },
        },
      },
    }),
    prisma.project.findMany({
      where: { ownerId: user.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const hotovych = await prisma.inboundMail.count({
    where: { ownerId: user.id, status: { not: "nova" } },
  });

  const view: MailView[] = mails.map((m) => {
    const s = (m.suggestion ?? null) as { reason?: string; confidence?: number; requestIds?: string[] } | null;
    return {
      ...m,
      receivedAt: m.receivedAt.toISOString(),
      reason: s?.reason ?? null,
      confidence: typeof s?.confidence === "number" ? s.confidence : null,
      // Navržené poptávky: celý seznam, ne jen ta hlavní.
      requestIds: Array.isArray(s?.requestIds) ? s.requestIds : m.requestId ? [m.requestId] : [],
    };
  });
  const waiting = view.filter((m) => m.status === "nova").length;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">Doručená pošta</h1>
          <p className="kicker mt-1">{waiting ? `${waiting} čeká na zařazení` : "vše zpracováno"}</p>
        </div>
        {(hotovych > 0 || vse) && (
          <Link
            href={vse ? "/posta" : "/posta?vse=1"}
            className="text-xs text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline"
          >
            {vse ? "Skrýt zpracované" : `Zobrazit zpracované · ${hotovych}`}
          </Link>
        )}
      </header>

      <MailInbox mails={view} projects={projects} configured={mailboxConfigured()} />

    </div>
  );
}
