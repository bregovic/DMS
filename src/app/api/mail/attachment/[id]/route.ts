import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

/**
 * Příloha z pošty, dokud z ní nevznikl dokument. Do té doby nemá projekt,
 * takže se právo odvozuje od majitele schránky.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const a = await prisma.inboundAttachment.findFirst({
    where: { id, mail: { ownerId: session.user.id } },
    select: { fileName: true, originalName: true, mimeType: true, size: true },
  });
  if (!a) return new Response("Not found", { status: 404 });

  const buffer = await storage.read(a.fileName);
  // Přímo v prohlížeči jen to, co neumí spustit skript – viz /api/documents.
  const inlineSafe = /^(application\/pdf|image\/(png|jpe?g|gif|webp|avif|heic|heif))$/i.test(a.mimeType);
  const name = `filename*=UTF-8''${encodeURIComponent(a.originalName)}`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `${inlineSafe ? "inline" : "attachment"}; ${name}`,
      "Content-Length": String(a.size),
      "X-Content-Type-Options": "nosniff",
      ...(inlineSafe ? {} : { "Content-Security-Policy": "sandbox" }),
    },
  });
}
