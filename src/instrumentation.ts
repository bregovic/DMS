/**
 * Pravidelné vybírání schránky (#41).
 *
 * DMS běží na Railway jako trvalý proces, takže stačí časovač uvnitř
 * aplikace – žádná externí cronová služba. Interval `MAIL_POLL_MINUTES`
 * (výchozí 10, hodnota 0 plánovač vypne). Ručně jde poštu vybrat
 * tlačítkem na stránce Doručená pošta a endpointem `/api/cron/mail`.
 */
export async function register() {
  // Jen v serverovém běhu (ne v edge runtime a ne při buildu).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const minutes = Number(process.env.MAIL_POLL_MINUTES ?? 10);
  if (!minutes || minutes <= 0) return;
  const { mailboxConfigured } = await import("@/lib/mailbox");
  if (!mailboxConfigured()) return;

  let running = false;
  const tick = async () => {
    if (running) return; // předchozí běh ještě neskončil
    running = true;
    try {
      const { prisma } = await import("@/lib/prisma");
      const { ingestMailbox, reportIngest } = await import("@/server/inbound");
      const result = await ingestMailbox();
      const to =
        process.env.MAIL_REPORT_TO ||
        (
          await prisma.user.findFirst({
            where: { notifyByEmail: true },
            select: { notifyEmail: true, email: true },
          })
        )?.notifyEmail ||
        null;
      if (to) await reportIngest(result, to, process.env.APP_URL || "https://dokumenty.up.railway.app");
    } catch (err) {
      console.error("[posta] Vybrání schránky selhalo:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  // První běh se zpozdí, ať nezdržuje start aplikace.
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, minutes * 60_000).unref?.();
}
