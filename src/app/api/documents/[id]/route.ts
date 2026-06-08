import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/documents/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.document.findFirst({
    where: { id, project: { ownerId: session.user.id } },
  });
  if (!doc) return new Response("Not found", { status: 404 });

  const buffer = await storage.read(doc.fileName);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        doc.originalName,
      )}`,
      "Content-Length": String(doc.size),
    },
  });
}
