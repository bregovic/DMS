import type { NextRequest } from "next/server";
import JSZip from "jszip";
import { auth } from "@/auth";
import { storage } from "@/lib/storage";
import { getProjectAttachments } from "@/server/attachments";

function parseDate(s: string | null, endOfDay = false): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/documents/zip">) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const sub = sp.get("sub");
  const from = parseDate(sp.get("from"));
  const to = parseDate(sp.get("to"), true);

  const res = await getProjectAttachments(id, session.user, { sub, from, to });
  if (!res) return new Response("Not found", { status: 404 });
  if (res.items.length === 0) return new Response("Žádné přílohy pro zadané období.", { status: 404 });

  const zip = new JSZip();
  const used = new Set<string>();
  for (const it of res.items) {
    let buffer: Buffer;
    try {
      buffer = await storage.read(it.fileName);
    } catch {
      continue; // chybějící soubor v úložišti přeskoč
    }
    const dateStr = it.date.toISOString().slice(0, 10);
    let name = `${dateStr}_${it.originalName}`.replace(/[\\/:*?"<>|]/g, "_");
    let n = 1;
    while (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)}(${n})${name.slice(dot)}` : `${name}(${n})`;
      n++;
    }
    used.add(name.toLowerCase());
    zip.file(name, buffer);
  }

  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const label = (res.subName ?? res.projectName).replace(/[\\/:*?"<>|]/g, "_");
  const range = [from && from.toISOString().slice(0, 10), to && to.toISOString().slice(0, 10)]
    .filter(Boolean)
    .join("_");
  const fileName = `prilohy-${label}${range ? `-${range}` : ""}.zip`;

  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(content.length),
    },
  });
}
