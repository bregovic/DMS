/**
 * Odchozí pošta (#41).
 *
 * Railway blokuje odchozí SMTP (ověřeno: port 587 z kontejneru neprojde),
 * takže se posílá přes Resend po HTTPS. Bez `RESEND_API_KEY` se nic
 * neodesílá a volající dostane `{ sent: false }` – odeslání zprávy nikdy
 * nesmí shodit operaci, kvůli které se posílá.
 */

export type MailResult = { sent: boolean; id?: string | null; error?: string };

const FROM = process.env.EMAIL_FROM || "DMS <dms@hollyhop.cz>";

export function mailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "Odesílání e-mailů není nastavené." };
  try {
    const { Resend } = await import("resend");
    const { data, error } = await new Resend(key).emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
    });
    if (error) return { sent: false, error: error.message || String(error) };
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Odeslání selhalo." };
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Jednotná podoba zprávy z DMS: nadpis, odstavce a nepovinné tlačítko.
 * Střídmě, ať to projde i v klientu, který nemá rád styly.
 */
export function mailTemplate(opts: {
  title: string;
  lines: string[];
  action?: { label: string; href: string };
  footer?: string;
}) {
  const body = opts.lines.map((l) => `<p style="margin:0 0 10px">${l}</p>`).join("");
  const button = opts.action
    ? `<p style="margin:20px 0 0"><a href="${esc(opts.action.href)}" style="display:inline-block;background:#0c0a09;color:#fff;padding:10px 18px;text-decoration:none;font-size:14px">${esc(
        opts.action.label,
      )}</a></p>`
    : "";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1c1917;max-width:560px">
<h1 style="font-size:19px;margin:0 0 14px;font-weight:600">${esc(opts.title)}</h1>
${body}${button}
<p style="margin:26px 0 0;font-size:12px;color:#a8a29e;border-top:1px solid #e7e5e4;padding-top:10px">${esc(
    opts.footer ?? "Zprávu poslal DMS. Posílání lze vypnout v Nastavení.",
  )}</p>
</div>`;
  const text = [opts.title, "", ...opts.lines.map(stripTags), opts.action ? `\n${opts.action.href}` : ""]
    .join("\n")
    .trim();
  return { html, text };
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

/** Text do HTML odstavce – escapuje a zachová zalomení. */
export function para(text: string) {
  return esc(text).replace(/\n/g, "<br>");
}
