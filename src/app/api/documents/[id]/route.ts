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
  const email = session.user.email?.toLowerCase();
  const projectAccess = email
    ? { OR: [{ ownerId: session.user.id }, { memberships: { some: { email } } }] }
    : { ownerId: session.user.id };
  const doc = await prisma.document.findFirst({
    where: { id, project: projectAccess },
  });
  if (!doc) return new Response("Not found", { status: 404 });

  const buffer = await storage.read(doc.fileName);

  /**
   * Přímo v prohlížeči jen to, co neumí spustit skript.
   *
   * Typ souboru pochází od prohlížeče při nahrání, takže nahraný .html nebo
   * .svg se dřív otevřel "inline" přímo na doméně DMS i se skripty. PDF
   * a běžné obrázky se zobrazují dál; ostatní se stáhne jako soubor a navíc
   * dostane sandbox, kdyby ho něco přece jen zkusilo vykreslit.
   */
  const inlineSafe = /^(application\/pdf|image\/(png|jpe?g|gif|webp|avif|heic|heif))$/i.test(
    doc.mimeType,
  );
  const name = `filename*=UTF-8''${encodeURIComponent(doc.originalName)}`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${inlineSafe ? "inline" : "attachment"}; ${name}`,
      "Content-Length": String(doc.size),
      "X-Content-Type-Options": "nosniff",
      ...(inlineSafe ? {} : { "Content-Security-Policy": "sandbox" }),
    },
  });
}
