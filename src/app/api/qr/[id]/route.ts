import QRCode from "qrcode";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildSpd, resolveIban } from "@/lib/payment";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/qr/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const email = session.user.email?.toLowerCase();
  const access = email
    ? { OR: [{ ownerId: session.user.id }, { memberships: { some: { email } } }] }
    : { ownerId: session.user.id };

  const e = await prisma.expense.findFirst({
    where: { id, project: access },
    include: { vendor: { select: { bankAccount: true } } },
  });
  if (!e) return new Response("Not found", { status: 404 });

  const iban = resolveIban(e.vendor?.bankAccount);
  if (!iban) {
    return new Response("Dodavatel nemá platný bankovní účet.", { status: 400 });
  }

  const spd = buildSpd({
    iban,
    amount: Number(e.amount),
    currency: e.currency,
    vs: e.variableSymbol,
    msg: e.title,
  });
  const png = await QRCode.toBuffer(spd, { width: 360, margin: 1 });

  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
