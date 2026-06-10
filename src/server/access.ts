import { prisma } from "@/lib/prisma";

export type ProjectRole = "owner" | "active" | "reader";

type SessionUser = { id: string; email?: string | null };

const projectInclude = {
  _count: { select: { expenses: true, documents: true } },
  expenses: { select: { amount: true, createdById: true } },
};

/** Projekty, ke kterým má uživatel přístup: vlastní + projektové i subprojektové členství. */
export async function listProjectsForUser(user: SessionUser) {
  const email = user.email?.toLowerCase() ?? null;

  const [owned, memberships, subMemberships] = await Promise.all([
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
    email
      ? prisma.subProjectMembership.findMany({
          where: { email },
          select: { projectId: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  const ownedIds = new Set(owned.map((p) => p.id));
  const seen = new Set<string>(ownedIds);
  const result: { project: (typeof owned)[number]; role: ProjectRole }[] = [];

  for (const p of owned) result.push({ project: p, role: "owner" });
  for (const m of memberships) {
    if (seen.has(m.projectId)) continue;
    seen.add(m.projectId);
    result.push({ project: m.project, role: (m.role as ProjectRole) ?? "reader" });
  }

  // projekty zpřístupněné jen přes subprojekt
  const extraIds = [
    ...new Set(subMemberships.map((m) => m.projectId).filter((id) => !seen.has(id))),
  ];
  if (extraIds.length > 0) {
    const roleByProject = new Map<string, ProjectRole>();
    for (const m of subMemberships) {
      const prev = roleByProject.get(m.projectId);
      const r = (m.role as ProjectRole) ?? "reader";
      // "active" má přednost před "reader"
      if (!prev || r === "active") roleByProject.set(m.projectId, r);
    }
    const projs = await prisma.project.findMany({
      where: { id: { in: extraIds } },
      include: projectInclude,
    });
    for (const p of projs) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      result.push({ project: p, role: roleByProject.get(p.id) ?? "reader" });
    }
  }

  return result;
}

export type ProjectAccess = {
  role: ProjectRole;
  /** null = celý projekt; pole = jen tyto subprojekty (+ jejich pod-složky). */
  scopeSubIds: string[] | null;
};

/** Role + rozsah přístupu uživatele k projektu. null = bez přístupu. */
export async function getProjectAccess(
  projectId: string,
  user: SessionUser,
): Promise<ProjectAccess | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });
  if (!project) return null;
  if (project.ownerId === user.id) return { role: "owner", scopeSubIds: null };

  const email = user.email?.toLowerCase();
  if (!email) return null;

  // projektové členství (celý projekt) má přednost
  const m = await prisma.projectMembership.findUnique({
    where: { projectId_email: { projectId, email } },
    select: { role: true },
  });
  if (m) return { role: (m.role as ProjectRole) ?? "reader", scopeSubIds: null };

  // jinak subprojektová členství
  const subs = await prisma.subProjectMembership.findMany({
    where: { projectId, email },
    select: { subProjectId: true, role: true },
  });
  if (subs.length === 0) return null;
  const role: ProjectRole = subs.some((s) => s.role === "active") ? "active" : "reader";
  return { role, scopeSubIds: subs.map((s) => s.subProjectId) };
}

/** Role uživatele u projektu (bez rozsahu), nebo null. */
export async function getProjectRole(
  projectId: string,
  user: SessionUser,
): Promise<ProjectRole | null> {
  return (await getProjectAccess(projectId, user))?.role ?? null;
}

/** Rozbalí rozsah subprojektů o všechny jejich pod-složky. */
export async function expandScope(
  projectId: string,
  scopeSubIds: string[],
): Promise<Set<string>> {
  const subs = await prisma.subProject.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  });
  const childrenOf = new Map<string, string[]>();
  for (const s of subs)
    if (s.parentId) {
      const a = childrenOf.get(s.parentId) ?? [];
      a.push(s.id);
      childrenOf.set(s.parentId, a);
    }
  const out = new Set<string>();
  const stack = [...scopeSubIds];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    (childrenOf.get(x) ?? []).forEach((c) => stack.push(c));
  }
  return out;
}
