import { prisma } from "@/lib/prisma";

export type ProjectRole = "owner" | "active" | "reader";

type SessionUser = { id: string; email?: string | null };

const projectInclude = {
  _count: { select: { expenses: true, documents: true } },
  expenses: { select: { amount: true } },
};

/** Projekty, ke kterým má uživatel přístup: vlastní + členství podle e-mailu. */
export async function listProjectsForUser(user: SessionUser) {
  const email = user.email?.toLowerCase() ?? null;

  const [owned, memberships] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: user.id },
      include: projectInclude,
      orderBy: { updatedAt: "desc" },
    }),
    email
      ? prisma.projectMembership.findMany({
          where: { email },
          include: { project: { include: projectInclude } },
        })
      : Promise.resolve([]),
  ]);

  const ownedIds = new Set(owned.map((p) => p.id));
  const result: { project: (typeof owned)[number]; role: ProjectRole }[] = [];

  for (const p of owned) result.push({ project: p, role: "owner" });
  for (const m of memberships) {
    if (ownedIds.has(m.projectId)) continue; // vlastníka neukazuj dvakrát
    result.push({
      project: m.project,
      role: (m.role as ProjectRole) ?? "reader",
    });
  }
  return result;
}

/** Role uživatele u konkrétního projektu, nebo null (bez přístupu). */
export async function getProjectRole(
  projectId: string,
  user: SessionUser,
): Promise<ProjectRole | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });
  if (!project) return null;
  if (project.ownerId === user.id) return "owner";

  const email = user.email?.toLowerCase();
  if (!email) return null;
  const m = await prisma.projectMembership.findUnique({
    where: { projectId_email: { projectId, email } },
    select: { role: true },
  });
  return m ? ((m.role as ProjectRole) ?? "reader") : null;
}
