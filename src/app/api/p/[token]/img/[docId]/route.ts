import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { resolvePortalToken } from "@/server/tenders";

/**
 * Fotka z galerie žádanky pro portál (#49). Vydá se jen fotka označená do
 * galerie u žádanky, kterou řízení z odkazu obsahuje.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/p/[token]/img/[docId]">) {
  const { token, docId } = await ctx.params;
  const ref = await resolvePortalToken(token);
  if (!ref) return new Response("Not found", { status: 404 });
  const doc = await prisma.document.findFirst({
    where: {
      id: docId,
      gallery: true,
      request: { tenders: { some: { tenderId: ref.tenderId } } },
    },
    select: { fileName: true, mimeType: true },
  });
  if (!doc || !/^image\/(png|jpe?g|gif|webp|avif)$/i.test(doc.mimeType)) return new Response("Not found", { status: 404 });
  const buf = await storage.read(doc.fileName);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
