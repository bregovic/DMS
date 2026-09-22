import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { mailboxConfigured } from "@/lib/mailbox";
import { MailInbox, type MailView } from "@/components/mail/mail-inbox";

/**
 * Doručená pošta (#41): vstupní rozřazovací složka. Nabídky a faktury se
 * do DMS dostávají přeposláním na vlastní schránku; tady se z nich – po
 * potvrzení – stanou dokumenty u žádanky nebo doklady projektu.
 */
export default async function MailPage() {
  const user = await requireUser();
  const [mails, projects] = await Promise.all([
    prisma.inboundMail.findMany({
      where: { ownerId: user.id },
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

  const view: MailView[] = mails.map((m) => {
    const s = (m.suggestion ?? null) as { reason?: string; confidence?: number } | null;
    return {
      ...m,
      receivedAt: m.receivedAt.toISOString(),
      reason: s?.reason ?? null,
      confidence: typeof s?.confidence === "number" ? s.confidence : null,
    };
  });
  const waiting = view.filter((m) => m.status === "nova").length;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Doručená pošta</h1>
        <p className="kicker mt-1">
          {waiting ? `${waiting} čeká na zařazení` : "vše zařazeno"}
        </p>
      </header>

      {!mailboxConfigured() && (
        <p className="mb-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Schránka pro příjem pošty zatím není nastavená. Doplň do prostředí <code>MAIL_IMAP_USER</code> a{" "}
          <code>MAIL_IMAP_PASS</code> (u Gmailu heslo aplikace), pak půjde poštu vybírat.
        </p>
      )}

      <MailInbox mails={view} projects={projects} configured={mailboxConfigured()} />

      <p className="mt-8 text-[11px] text-stone-400">
        Pošta se vybírá pravidelně na pozadí; tlačítkem jde vybrat i hned. Přijme se jen e-mail od
        adresy, kterou DMS zná – od tebe nebo od dodavatele v evidenci. Nic se nezakládá samo.
      </p>
    </div>
  );
}
