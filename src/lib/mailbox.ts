import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * Vybírání schránky přes IMAP (#41).
 *
 * Do DMS se nabídky a faktury dostávají přeposláním na vlastní schránku
 * (typicky Gmail). IMAP z Railway funguje – ověřeno TLS spojením na
 * imap.gmail.com:993; odchozí SMTP naopak blokované je, proto se zpětné
 * zprávy posílají přes Resend (viz `lib/mailer.ts`).
 *
 * Nastavení (proměnné prostředí):
 *  - MAIL_IMAP_HOST (imap.gmail.com), MAIL_IMAP_PORT (993)
 *  - MAIL_IMAP_USER, MAIL_IMAP_PASS  – u Gmailu **heslo aplikace**, ne heslo k účtu
 *  - MAIL_IMAP_MAILBOX (INBOX), MAIL_MAX_PER_RUN (20)
 *
 * Přečtené zprávy se označí jako přečtené, aby se příště nestahovaly znovu;
 * druhou pojistkou je unikátní Message-ID v databázi.
 */

export type FetchedAttachment = {
  originalName: string;
  mimeType: string;
  size: number;
  content: Buffer;
};

export type FetchedMail = {
  messageId: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  receivedAt: Date;
  bodyText: string | null;
  /** Originál .eml. Skript v Gmailu ho neposílá, proto nepovinný. */
  raw?: Buffer | null;
  attachments: FetchedAttachment[];
};

export function mailboxConfigured() {
  return !!(process.env.MAIL_IMAP_USER && process.env.MAIL_IMAP_PASS);
}

/** Největší příloha, kterou má smysl stahovat (větší stejně AI nepřečte). */
const MAX_ATTACHMENT = Number(process.env.MAIL_MAX_ATTACHMENT_MB || 20) * 1024 * 1024;

/** Přílohy, které nejsou příloha: podpisové obrázky, ikonky, sledovací pixely. */
function isRealAttachment(a: { filename?: string; contentType: string; size: number; contentDisposition?: string }) {
  if (!a.filename) return false;
  if (a.size < 8 * 1024 && a.contentType.startsWith("image/")) return false;
  if (a.contentDisposition === "inline" && a.contentType.startsWith("image/")) return false;
  return a.size <= MAX_ATTACHMENT;
}

/**
 * Stáhne nepřečtené zprávy. Vrací je i s přílohami v paměti – volající je
 * uloží do úložiště. Spojení se vždy zavře, i když zpracování spadne.
 */
export async function fetchUnseen(limit = Number(process.env.MAIL_MAX_PER_RUN || 20)): Promise<FetchedMail[]> {
  if (!mailboxConfigured()) throw new Error("Schránka pro příjem pošty není nastavená.");
  const client = new ImapFlow({
    host: process.env.MAIL_IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.MAIL_IMAP_USER!, pass: process.env.MAIL_IMAP_PASS! },
    logger: false,
  });

  const out: FetchedMail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock(process.env.MAIL_IMAP_MAILBOX || "INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      // Nejstarší první, ať se pošta zpracovává v pořadí, v jakém přišla.
      const take = (uids || []).slice(0, limit);
      for (const uid of take) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        // fetchOne vrací false, když zpráva mezitím zmizela.
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.value?.[0];
        if (!from?.address) continue;
        out.push({
          // Bez Message-ID (občas u přeposlání chybí) složíme vlastní klíč.
          messageId: parsed.messageId || `uid-${uid}-${parsed.date?.getTime() ?? Date.now()}`,
          fromName: from.name || null,
          fromAddress: from.address.toLowerCase(),
          subject: parsed.subject || "(bez předmětu)",
          receivedAt: parsed.date ?? new Date(),
          bodyText: parsed.text?.trim() || null,
          raw: msg.source as Buffer,
          attachments: (parsed.attachments || []).filter(isRealAttachment).map((a) => ({
            originalName: a.filename || "priloha",
            mimeType: a.contentType || "application/octet-stream",
            size: a.size,
            content: a.content as Buffer,
          })),
        });
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  return out;
}
