import { prisma } from "@/lib/prisma";
import { getProjectAccess, expandScope } from "@/server/access";

export type AttachmentItem = {
  docId: string;
  fileName: string; // storage key
  originalName: string;
  mimeType: string;
  size: number;
  expenseTitle: string;
  date: Date; // datum výdaje
  amount: number;
  subProjectId: string | null;
};

export type AttachmentsResult = {
  projectName: string;
  subName: string | null;
  items: AttachmentItem[];
};

/** Seznam příloh (skenů) na výdajích v projektu/složce za zadané období.
 *  Respektuje přístup: spolusprávce/vlastník/čtenář vidí vše, dodavatel jen své. */
export async function getProjectAttachments(
  projectId: string,
  user: { id: string; email?: string | null },
  opts: { sub?: string | null; from?: Date | null; to?: Date | null },
): Promise<AttachmentsResult | null> {
  const access = await getProjectAccess(projectId, user);
  if (!access) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, ownerId: true },
  });
  if (!project) return null;

  // Rozsah složek: průnik vybraného subprojektu a (případného) scope člena.
  const visible = access.scopeSubIds
    ? await expandScope(projectId, access.scopeSubIds)
    : null;
  const target = opts.sub ? await expandScope(projectId, [opts.sub]) : null;
  let subFilter: string[] | null = null;
  if (visible && target) subFilter = [...target].filter((id) => visible.has(id));
  else if (target) subFilter = [...target];
  else if (visible) subFilter = [...visible];

  let subName: string | null = null;
  if (opts.sub) {
    const s = await prisma.subProject.findUnique({
      where: { id: opts.sub },
      select: { name: true },
    });
    subName = s?.name ?? null;
  }

  // Dodavatel ("active") vidí jen své výdaje (vlastní nebo kde je dodavatelem).
  const onlyMine = access.role === "active";
  const myEmail = user.email?.toLowerCase();
  const myVendorIds =
    onlyMine && myEmail
      ? (
          await prisma.vendor.findMany({
            where: { email: { equals: myEmail, mode: "insensitive" } },
            select: { id: true },
          })
        ).map((v) => v.id)
      : [];

  const dateFilter =
    opts.from || opts.to
      ? { date: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
      : {};

  const docs = await prisma.document.findMany({
    where: {
      projectId,
      expenseId: { not: null },
      expense: {
        ...dateFilter,
        ...(subFilter ? { subProjectId: { in: subFilter } } : {}),
        ...(onlyMine
          ? {
              OR: [
                { createdById: user.id },
                ...(myVendorIds.length ? [{ vendorId: { in: myVendorIds } }] : []),
              ],
            }
          : {}),
      },
    },
    select: {
      id: true,
      fileName: true,
      originalName: true,
      mimeType: true,
      size: true,
      expense: { select: { title: true, date: true, amount: true, subProjectId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const items: AttachmentItem[] = docs
    .filter((d) => d.expense)
    .map((d) => ({
      docId: d.id,
      fileName: d.fileName,
      originalName: d.originalName,
      mimeType: d.mimeType,
      size: d.size,
      expenseTitle: d.expense!.title,
      date: d.expense!.date,
      amount: Number(d.expense!.amount),
      subProjectId: d.expense!.subProjectId,
    }));

  return { projectName: project.name, subName, items };
}
