import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestMailbox, reportIngest } from "@/server/inbound";

/**
 * Vybrání schránky (#41). Volá se plánovaně (Railway cron) nebo ručně
 * tlačítkem na stránce Doručená pošta.
 *
 * Chráněné sdíleným tajemstvím `CRON_SECRET` – hlavičkou `Authorization:
 * Bearer …` nebo parametrem `?key=`. Bez nastaveného tajemství endpoint
 * neběží vůbec, ať není otevřený.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const key = bearer ?? new URL(req.url).searchParams.get("key");
  return !!key && key === secret;
}

async function run() {
  const result = await ingestMailbox();
  // Zpráva o zpracování: na adresu z nastavení, jinak majiteli schránky.
  const to =
    process.env.MAIL_REPORT_TO ||
    (
      await prisma.user.findFirst({
        where: { notifyByEmail: true },
        select: { notifyEmail: true, email: true },
      })
    )?.notifyEmail ||
    null;
  const base = process.env.APP_URL || "https://dokumenty.up.railway.app";
  if (to) await reportIngest(result, to, base);
  return result;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "Nepovolený přístup." }, { status: 401 });
  try {
    return Response.json(await run());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Zpracování selhalo." },
      { status: 500 },
    );
  }
}

export const POST = GET;
