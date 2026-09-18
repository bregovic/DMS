"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectRole, isManager } from "@/server/access";
import { TASK_DONE_STATUSES } from "@/lib/constants";
import {
  createCostDraft,
  createPlanDraft,
  createVendorSelectionTodos,
  runCostDraft,
  runPlanDraft,
  type CostEstimateResult,
  type PlanResult,
} from "@/server/plan-ai";
import { recomputeSchedule } from "@/server/actions/tasks";

async function managerOf(projectId: string) {
  const user = await requireUser();
  if (!isManager(await getProjectRole(projectId, user))) throw new Error("Plán z dokumentace připravuje správce projektu.");
  return user;
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath("/planning");
}

/** Spustit AI plán z vybraných dokumentů projektu. Běží na pozadí. */
export async function startPlanDraft(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await managerOf(projectId);
  const id = await createPlanDraft(
    projectId,
    user.id,
    formData.getAll("documentIds").map(String),
    String(formData.get("prompt") || ""),
  );
  after(() => runPlanDraft(id));
  refresh(projectId);
}

export async function getPlanDraft(id: string) {
  const d = await prisma.planDraft.findUnique({
    where: { id },
    select: { id: true, projectId: true, status: true, result: true, prompt: true, costUsd: true, createdAt: true, documentIds: true },
  });
  if (!d) throw new Error("Návrh nenalezen.");
  await managerOf(d.projectId);
  return { ...d, result: d.result as unknown as PlanResult | null, createdAt: d.createdAt.toISOString() };
}

/**
 * Potvrdit návrh: založit vybrané fáze a úkoly (s odhadem dní, nákladů,
 * úkonem z katalogu a tím, co poptat) a spočítat termíny plánovačem.
 */
export async function applyPlanDraft(formData: FormData) {
  const id = String(formData.get("id"));
  const d = await prisma.planDraft.findUnique({
    where: { id },
    select: { id: true, projectId: true, status: true, result: true },
  });
  if (!d?.result) throw new Error("Návrh nenalezen.");
  if (d.status === "applied") throw new Error("Návrh už je v plánu.");
  const user = await managerOf(d.projectId);
  const plan = d.result as unknown as PlanResult;
  const chosen = plan.phases.map((ph, i) => ({ ph, i })).filter(({ i }) => formData.get(`phase_${i}`) === "1");
  if (chosen.length === 0) throw new Error("Vyber aspoň jednu fázi.");

  const [project, ops, lastPhase] = await Promise.all([
    prisma.project.findUnique({ where: { id: d.projectId }, select: { startDate: true, plannedEnd: true } }),
    prisma.operation.findMany({ select: { id: true, code: true } }),
    prisma.task.findFirst({
      where: { projectId: d.projectId, kind: "phase", dueDate: { not: null } },
      orderBy: { dueDate: "desc" },
      select: { dueDate: true },
    }),
  ]);
  const opByCode = new Map(ops.map((o) => [o.code, o.id]));
  const DAY = 86400000;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // Nové fáze za ty, co už v plánu jsou; jinak od začátku projektu (i zpětně), jinak od dneška.
  let base = lastPhase?.dueDate ? lastPhase.dueDate.getTime() + DAY : (project?.startDate?.getTime() ?? today);
  // Plánovač řadí fáze podle začátku a úkoly podle vzniku – obojí musí jít
  // v pořadí návrhu, i když se zakládá v jedné transakci.
  let stamp = Date.now();

  await prisma.$transaction(async (tx) => {
    for (const { ph } of chosen) {
      const phase = await tx.task.create({
        data: {
          projectId: d.projectId,
          kind: "phase",
          title: ph.title.slice(0, 200),
          status: "todo",
          startDate: new Date(base),
          dueDate: new Date(base),
          createdById: user.id,
          createdAt: new Date(stamp++),
        },
        select: { id: true },
      });
      base += DAY;
      for (const t of ph.tasks) {
        const desc = [
          t.quantity != null ? `Množství: ${t.quantity} ${t.unit ?? ""}`.trim() : null,
          t.note,
          "Navrženo z dokumentace.",
        ]
          .filter(Boolean)
          .join("\n");
        await tx.task.create({
          data: {
            projectId: d.projectId,
            parentId: phase.id,
            kind: "task",
            title: t.title.slice(0, 200),
            description: desc,
            status: "todo",
            estimateDays: Math.max(1, Math.round(t.estimateDays || 1)),
            costEstimate: t.costEstimate != null && t.costEstimate > 0 ? t.costEstimate : null,
            profession: t.profession,
            procurement: t.procurement,
            operationId: t.operationCode ? opByCode.get(t.operationCode) ?? null : null,
            createdById: user.id,
            createdAt: new Date(stamp++),
          },
        });
      }
    }
    await tx.planDraft.update({ where: { id: d.id }, data: { status: "applied" } });
  }, { timeout: 60_000, maxWait: 10_000 }); // hodně zápisů – výchozí 5 s nestačí

  // Termíny spočítá plánovač z odhadů dní a pořadí (jako „Přepočítat termíny“).
  const fd = new FormData();
  fd.set("projectId", d.projectId);
  await recomputeSchedule(fd);

  // Očekávané dokončení projektu, pokud ho uživatel nezadal.
  if (!project?.plannedEnd) {
    const last = await prisma.task.findFirst({
      where: { projectId: d.projectId, dueDate: { not: null } },
      orderBy: { dueDate: "desc" },
      select: { dueDate: true },
    });
    if (last?.dueDate) await prisma.project.update({ where: { id: d.projectId }, data: { plannedEnd: last.dueDate } });
  }
  // Vlastníkovi úkoly na výběr dodavatelů – s termínem před začátkem fází.
  await createVendorSelectionTodos(d.projectId, user.id);
  refresh(d.projectId);
}

export async function dismissPlanDraft(formData: FormData) {
  const d = await prisma.planDraft.findUnique({ where: { id: String(formData.get("id")) }, select: { id: true, projectId: true } });
  if (!d) return;
  await managerOf(d.projectId);
  await prisma.planDraft.update({ where: { id: d.id }, data: { status: "dismissed" } });
  refresh(d.projectId);
}

/**
 * Žádanky pro výběr dodavatelů z plánu: z každého nehotového úkolu, u kterého
 * plán říká, co poptat, a který ještě žádanku nemá. Termín = začátek úkolu.
 */
export async function createRequestsFromPlan(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await managerOf(projectId);
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      procurement: { not: null },
      status: { notIn: TASK_DONE_STATUSES },
      requests: { none: {} },
    },
    select: { id: true, title: true, procurement: true, subProjectId: true, startDate: true },
    orderBy: { startDate: "asc" },
  });
  if (tasks.length === 0) throw new Error("V plánu není nic k poptání (nebo už žádanky existují).");
  await prisma.request.createMany({
    data: tasks.map((t) => ({
      projectId,
      subProjectId: t.subProjectId,
      taskId: t.id,
      title: t.procurement!.slice(0, 200),
      description: `K úkolu „${t.title}“ z plánu.`,
      status: "poptavka",
      unit: "ks",
      category: "materials",
      requiredDate: t.startDate,
      createdById: user.id,
    })),
  });
  refresh(projectId);
  return { created: tasks.length };
}

/** Doplnit vlastníkovi úkoly „Vybrat dodavatele – fáze“ (i do stávajícího plánu). */
export async function addVendorSelectionTodos(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await managerOf(projectId);
  const n = await createVendorSelectionTodos(projectId, user.id);
  refresh(projectId);
  revalidatePath("/ukoly");
  return { created: n };
}

/** AI odhad nákladů pro úkoly stávajícího plánu, které odhad nemají. Běží na pozadí. */
export async function startCostDraft(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await managerOf(projectId);
  const id = await createCostDraft(projectId, user.id, String(formData.get("prompt") || ""));
  after(() => runCostDraft(id));
  refresh(projectId);
}

/** Návrh odhadů + názvy úkolů a fází pro kontrolu. */
export async function getCostDraft(id: string) {
  const d = await prisma.planDraft.findUnique({
    where: { id },
    select: { id: true, projectId: true, kind: true, status: true, result: true },
  });
  if (!d || d.kind !== "costs") throw new Error("Návrh nenalezen.");
  await managerOf(d.projectId);
  const result = d.result as unknown as CostEstimateResult | null;
  const tasks = await prisma.task.findMany({
    where: { id: { in: (result?.items ?? []).map((i) => i.id) } },
    select: { id: true, title: true, kind: true, parent: { select: { title: true } } },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return {
    id: d.id,
    status: d.status,
    summary: result?.summary ?? "",
    items: (result?.items ?? [])
      .filter((i) => byId.has(i.id))
      .map((i) => ({
        ...i,
        title: byId.get(i.id)!.title,
        phase: byId.get(i.id)!.parent?.title ?? (byId.get(i.id)!.kind === "phase" ? "Samostatné fáze" : "Bez fáze"),
      })),
  };
}

/** Uložit (případně upravené) odhady do úkolů – jen těm, které odhad pořád nemají. */
export async function applyCostDraft(formData: FormData) {
  const id = String(formData.get("id"));
  const d = await prisma.planDraft.findUnique({ where: { id }, select: { id: true, projectId: true, kind: true, result: true } });
  if (!d?.result || d.kind !== "costs") throw new Error("Návrh nenalezen.");
  await managerOf(d.projectId);
  const items = (d.result as unknown as CostEstimateResult).items;
  const updates: { id: string; v: number }[] = [];
  for (const it of items) {
    const raw = String(formData.get(`cost_${it.id}`) ?? "").replace(/s/g, "").replace(",", ".");
    if (!raw) continue;
    const v = Number(raw);
    if (!isNaN(v) && v >= 0) updates.push({ id: it.id, v });
  }
  await prisma.$transaction([
    ...updates.map((u) =>
      prisma.task.updateMany({
        where: { id: u.id, projectId: d.projectId, costEstimate: null },
        data: { costEstimate: u.v },
      }),
    ),
    prisma.planDraft.update({ where: { id: d.id }, data: { status: "applied" } }),
  ]);
  refresh(d.projectId);
  revalidatePath("/dashboard");
  return { updated: updates.length };
}
