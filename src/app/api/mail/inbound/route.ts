import type { NextRequest } from "next/server";
import { storeMail, reportIngest, emptyIngest } from "@/server/inbound";
import type { FetchedMail } from "@/lib/mailbox";

/**
 * Příjem pošty ze skriptu v Gmailu (#41).
 *
 * Skript běží pod účtem schránky, takže nepotřebuje heslo aplikace ani IMAP –
 * přečte nové zprávy a pošle je sem. Autorizace sdíleným tajemstvím
 * `CRON_SECRET` v hlavičce `Authorization: Bearer …`.
 *
 * Tělo (JSON):
 *   { messageId, from, fromName?, subject, date, body, labels?,
 *     attachments: [{ name, mimeType, data }] }   // data = base64
 *
 * `labels` jsou štítky zprávy z Gmailu: štítek pojmenovaný jako projekt
 * určí zařazení napevno, bez hádání z textu.
 *
 * Zpracování je pak totožné s vybráním schránky: uloží se do vstupní složky,
 * navrhne se zařazení a nic se nezakládá bez potvrzení.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Přílohy dohromady – nad tímhle by request stejně nedoletěl. */
const MAX_BODY_MB = Number(process.env.MAIL_WEBHOOK_MAX_MB || 25);

type Payload = {
  messageId?: string;
  from?: string;
  fromName?: string;
  subject?: string;
  date?: string;
  body?: string;
  /** Štítky z Gmailu – stejnojmenný štítek určí projekt. */
  labels?: string[];
  attachments?: { name?: string; mimeType?: string; data?: string }[];
};

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  return !!bearer && bearer === secret;
}

/** "Jméno <mail@firma.cz>" → adresa a jméno zvlášť. */
function parseFrom(raw: string) {
  const m = raw.match(/<([^>]+)>/);
  const address = (m ? m[1] : raw).trim().toLowerCase();
  const name = m ? raw.slice(0, m.index).replace(/["']/g, "").trim() : "";
  return { address, name: name || null };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "Nepovolený přístup." }, { status: 401 });

  let p: Payload;
  try {
    p = (await req.json()) as Payload;
  } catch {
    return Response.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const from = String(p.from || "").trim();
  if (!from) return Response.json({ error: "Chybí odesílatel." }, { status: 400 });
  const { address, name } = parseFrom(from);

  const attachments = (p.attachments ?? [])
    .filter((a) => a?.data && a?.name)
    .map((a) => {
      const content = Buffer.from(a.data!, "base64");
      return {
        originalName: a.name!,
        mimeType: a.mimeType || "application/octet-stream",
        size: content.length,
        content,
      };
    });
  const total = attachments.reduce((sum, a) => sum + a.size, 0);
  if (total > MAX_BODY_MB * 1024 * 1024)
    return Response.json({ error: `Přílohy jsou větší než ${MAX_BODY_MB} MB.` }, { status: 413 });

  const date = p.date ? new Date(p.date) : new Date();
  const mail: FetchedMail = {
    // Bez Message-ID by se přeposlaná zpráva uložila podruhé – složíme náhradu.
    messageId: String(p.messageId || `gmail-${address}-${date.getTime()}`),
    fromName: name,
    fromAddress: address,
    subject: String(p.subject || "(bez předmětu)"),
    receivedAt: isNaN(date.getTime()) ? new Date() : date,
    bodyText: String(p.body || "").trim() || null,
    labels: Array.isArray(p.labels) ? p.labels.map(String).slice(0, 20) : [],
    raw: null,
    attachments,
  };

  const res = emptyIngest(1);
  await storeMail(mail, res);

  // Zpráva o zpracování jen když se něco doopravdy stalo.
  const to = process.env.MAIL_REPORT_TO;
  if (to && (res.stored > 0 || res.skipped.length > 0 || res.failed.length > 0))
    await reportIngest(res, to, process.env.APP_URL || "https://dokumenty.up.railway.app").catch(() => {});

  return Response.json({
    stored: res.stored,
    skipped: res.skipped,
    mailId: res.mails[0]?.id ?? null,
  });
}

export async function GET() {
  return Response.json({ status: "ok", hint: "POST s hlavičkou Authorization: Bearer <CRON_SECRET>" });
}
