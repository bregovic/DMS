import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager } from "@/server/access";

/**
 * Denní strop nahrávání pro spolupracovníky (dodavatele). Vlastník a
 * spolusprávce omezení nemají – platí si vlastní místo.
 *
 * Fotka účtenky z telefonu vyjde po vyčištění na ~130 kB, takže strop je
 * pojistka proti nahrané dokumentaci nebo videu, ne proti dni na stavbě.
 *  - UPLOAD_MAX_DOCS_PER_DAY  počet souborů za den (20)
 *  - UPLOAD_MAX_MB_PER_DAY    objem za den (50 MB)
 */
export const UPLOAD_QUOTA = {
  docsPerDay: Number(process.env.UPLOAD_MAX_DOCS_PER_DAY || 20),
  bytesPerDay: Number(process.env.UPLOAD_MAX_MB_PER_DAY || 50) * 1024 * 1024,
};

const MB = 1024 * 1024;

function dayStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Co uživatel dnes nahrál do cizích projektů – jeden společný strop přes
 * všechny projekty, kde je dodavatelem.
 */
export async function uploadQuotaUsage(userId: string) {
  const agg = await prisma.document.aggregate({
    where: {
      uploadedById: userId,
      createdAt: { gte: dayStart() },
      project: { ownerId: { not: userId } },
    },
    _count: { _all: true },
    _sum: { size: true },
  });
  return { docs: agg._count._all, bytes: agg._sum.size ?? 0, quota: UPLOAD_QUOTA };
}

/**
 * Pojistka před uložením souboru do úložiště: kolik kusů a kolik MB smí
 * spolupracovník nahrát za den. Vlastníka a spolusprávce projektu přeskočí.
 */
export async function assertUploadQuota(
  user: { id: string; email?: string | null },
  projectId: string,
  bytes: number,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");
  if (project.ownerId === user.id) return;
  if (isManager(await getProjectRole(projectId, user))) return;

  const used = await uploadQuotaUsage(user.id);
  if (used.docs >= UPLOAD_QUOTA.docsPerDay)
    throw new Error(
      `Dnešní limit nahrávání je vyčerpaný (${UPLOAD_QUOTA.docsPerDay} souborů). Zkus to zítra, nebo pošli doklad majiteli projektu.`,
    );
  if (used.bytes + bytes > UPLOAD_QUOTA.bytesPerDay)
    throw new Error(
      `Dnešní limit nahrávání je vyčerpaný (${Math.round(UPLOAD_QUOTA.bytesPerDay / MB)} MB). Zkus to zítra, nebo pošli doklad majiteli projektu.`,
    );
}
