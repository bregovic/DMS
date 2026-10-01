import { appVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { v: appVersion() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
