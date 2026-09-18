import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectAccess } from "@/server/access";
import {
  LAST_PROJECT_COOKIE,
  parseProjectTab,
  projectHref,
} from "@/components/projects/project-tabs";

/**
 * Vstup do aplikace – odtud startuje i nainstalovaná aplikace (start_url).
 *
 * Přihlášený se vrací do naposledy otevřeného projektu (i do složky
 * a záložky, kde byl). Přehled zůstává v menu. Když projekt mezitím zmizel
 * nebo k němu přístup skončil, jde se na přehled jako dřív.
 */
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const raw = (await cookies()).get(LAST_PROJECT_COOKIE)?.value;
  if (raw) {
    const [projectId, sub, tab] = decodeURIComponent(raw).split("|");
    if (projectId && /^[a-z0-9]+$/i.test(projectId)) {
      const access = await getProjectAccess(projectId, session.user);
      if (access) {
        const safeSub = sub && /^[a-z0-9]+$/i.test(sub) ? sub : null;
        redirect(projectHref(projectId, safeSub, parseProjectTab(tab)));
      }
    }
  }

  redirect("/dashboard");
}
