import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Seznam projektů pro skript v Gmailu (#41).
 *
 * Skript si ho stáhne a podle něj sbírá zprávy ze stejnojmenných štítků –
 * díky tomu stačí v DMS založit projekt a v Gmailu štítek téhož jména,
 * do skriptu se nemusí sahat.
 *
 * Autorizace stejným tajemstvím jako příjem pošty (`CRON_SECRET`).
 * `MAIL_OWNER_EMAIL` omezí výpis na projekty jednoho uživatele; bez něj
 * se vrátí projekty všech (u jednouživatelského nasazení totéž).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!secret || bearer !== secret) return Response.json({ error: "Nepovolený přístup." }, { status: 401 });

  const owner = process.env.MAIL_OWNER_EMAIL?.trim().toLowerCase();
  const projects = await prisma.project.findMany({
    where: owner ? { owner: { email: { equals: owner, mode: "insensitive" } } } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return Response.json({ projects: projects.map((p) => p.name) });
}
