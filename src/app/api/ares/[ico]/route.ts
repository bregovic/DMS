import type { NextRequest } from "next/server";
import { auth } from "@/auth";

// Dotažení ekonomického subjektu z veřejného registru ARES (MF ČR).
// Vrací jen pole, která plníme u dodavatele: název, DIČ, adresu.
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/ares/[ico]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ico } = await ctx.params;
  const clean = ico.replace(/\D/g, "");
  if (clean.length < 1 || clean.length > 8) {
    return Response.json({ error: "Neplatné IČO." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${clean}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
  } catch {
    return Response.json({ error: "ARES je nedostupný." }, { status: 502 });
  }

  if (res.status === 404) {
    return Response.json({ error: "Subjekt s tímto IČO nenalezen." }, { status: 404 });
  }
  if (!res.ok) {
    return Response.json({ error: "ARES vrátil chybu." }, { status: 502 });
  }

  const data = (await res.json()) as {
    ico?: string;
    obchodniJmeno?: string;
    dic?: string;
    sidlo?: { textovaAdresa?: string };
  };

  return Response.json({
    ico: data.ico ?? clean,
    name: data.obchodniJmeno ?? null,
    dic: data.dic ?? null,
    address: data.sidlo?.textovaAdresa ?? null,
  });
}
