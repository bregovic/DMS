import { auth } from "@/auth";
import { buildKhXml } from "@/server/kh-xml";

/** XML kontrolního hlášení (DPHKH1) k načtení na portálu MOJE daně. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
  const period = url.searchParams.get("period") || `m${new Date().getUTCMonth() + 1}`;
  const projectId = url.searchParams.get("project") || null;
  if (period === "rok") return new Response("Kontrolní hlášení se podává za měsíc nebo čtvrtletí.", { status: 400 });

  const { xml } = await buildKhXml(
    session.user.id,
    period.startsWith("q") ? { year, quarter: Number(period.slice(1)) } : { year, month: Number(period.replace("m", "")) },
    projectId,
  );
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="kontrolni-hlaseni-${year}-${period}.xml"`,
    },
  });
}
