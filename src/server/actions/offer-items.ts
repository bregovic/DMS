"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager } from "@/server/access";
import { createItemReview, prepareOfferItems, runItemReview, runOfferItems } from "@/server/offer-items";

/** Nabídky po položkách (#47) – spouští správce projektu, platí vlastník. */

async function managerOfBundle(bundleId: string) {
  const user = await requireUser();
  const b = await prisma.requestBundle.findUnique({ where: { id: bundleId }, select: { id: true, projectId: true } });
  if (!b) throw new Error("Balíček nenalezen.");
  if (!isManager(await getProjectRole(b.projectId, user))) throw new Error("Rozpis spouští správce projektu.");
  return { user, bundle: b };
}

/** Rozepsat položky jedné nabídky. */
export async function startOfferItems(formData: FormData) {
  const o = await prisma.bundleOffer.findUnique({
    where: { id: String(formData.get("id")) },
    select: { id: true, bundleId: true },
  });
  if (!o) throw new Error("Nabídka nenalezena.");
  const { bundle } = await managerOfBundle(o.bundleId);
  await prepareOfferItems(o.id);
  after(() => runOfferItems(o.id));
  revalidatePath(`/projects/${bundle.projectId}`);
}

/**
 * Rozepsat všechny nabídky balíčku, které ještě rozepsané nejsou.
 * Běží jedna po druhé, ať nenarazí na strop souběžných běhů.
 */
export async function startBundleItems(formData: FormData) {
  const { bundle } = await managerOfBundle(String(formData.get("bundleId")));
  const offers = await prisma.bundleOffer.findMany({
    where: { bundleId: bundle.id, OR: [{ itemsStatus: null }, { itemsStatus: "error" }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const ids: string[] = [];
  let firstError: string | null = null;
  for (const o of offers) {
    try {
      await prepareOfferItems(o.id);
      ids.push(o.id);
    } catch (e) {
      firstError ??= e instanceof Error ? e.message : "Rozpis nejde spustit.";
    }
  }
  if (!ids.length) throw new Error(firstError ?? "Všechny nabídky už jsou rozepsané.");
  after(async () => {
    for (const id of ids) await runOfferItems(id);
  });
  revalidatePath(`/projects/${bundle.projectId}`);
}

/** Rozbor nabídnutých výrobků k žádance (s hledáním na webu). */
export async function startItemReview(formData: FormData) {
  const user = await requireUser();
  const rq = await prisma.request.findUnique({
    where: { id: String(formData.get("requestId")) },
    select: { id: true, projectId: true },
  });
  if (!rq) throw new Error("Žádanka nenalezena.");
  if (!isManager(await getProjectRole(rq.projectId, user))) throw new Error("Rozbor spouští správce projektu.");
  const id = await createItemReview(rq.id, user.id, String(formData.get("prompt") || ""));
  after(() => runItemReview(id));
  revalidatePath(`/projects/${rq.projectId}`);
}
