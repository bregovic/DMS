import type { NextRequest } from "next/server";
import { fetchAres } from "@/server/doc-scan";
import { resolvePortalToken } from "@/server/tenders";

/** Název firmy podle IČO pro formulář na portálu (#49) – jen s platným odkazem. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/p/[token]/ares/[ico]">) {
  const { token, ico } = await ctx.params;
  if (!(await resolvePortalToken(token))) return Response.json({ error: "Nenalezeno." }, { status: 404 });
  const a = await fetchAres(ico);
  if (!a?.name) return Response.json({ error: "IČO v ARES nenalezeno." }, { status: 404 });
  return Response.json({ name: a.name, address: a.address });
}
