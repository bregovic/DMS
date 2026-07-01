import type { NextRequest } from "next/server";
import JSZip from "jszip";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
  // Volitelný výběr konkrétních příloh; když chybí, bere se celý (filtrovaný) seznam.
  const idParam = sp.get("ids");
  const pickIds = idParam
    ? new Set(idParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  const res = await getProjectAttachments(id, session.user, { sub, from, to });
  if (!res) return new Response("Not found", { status: 404 });
  const chosen = pickIds ? res.items.filter((it) => pickIds.has(it.docId)) : res.items;
  if (chosen.length === 0) return new Response("Žádné přílohy k stažení.", { status: 404 });

  const zip = new JSZip();
  const used = new Set<string>();
  const zippedDocIds: string[] = [];
  for (const it of chosen) {
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
    zippedDocIds.push(it.docId);
  }
  if (zippedDocIds.length === 0) {
    return new Response("Soubory se nepodařilo načíst z úložiště.", { status: 404 });
  }

  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  // Po úspěšném sestavení ZIPu označíme stažené přílohy jako vyexportované.
  await prisma.document.updateMany({
    where: { id: { in: zippedDocIds }, projectId: id },
    data: { exportedAt: new Date() },
  });
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
