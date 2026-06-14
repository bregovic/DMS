import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, canExportProject } from "@/server/access";
import {
  PLAN_VERSION,
  isoDate,
  type ProjectPlan,
  type PlanVendor,
} from "@/lib/plan";

// Export celého projektového plánu do JSON (žádanky + nabídky, fáze + úkoly,
// výdaje, dodavatelé). ID i REF se plní stejnou hodnotou (id), aby šel plán
// doplnit a naimportovat zpět (aktualizace podle ID, provázání podle REF).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, type: true, ownerId: true },
  });
  if (!project) return new Response("Projekt nenalezen.", { status: 404 });
  const access = await getProjectAccess(project.id, session.user);
  if (!canExportProject(access)) {
    return new Response("Na tento projekt nemáš přístup.", { status: 403 });
  }

  const [subs, requests, tasks, expenses] = await Promise.all([
    prisma.subProject.findMany({
      where: { projectId: project.id },
      select: { id: true, parentId: true, name: true, description: true },
    }),
    prisma.request.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      include: {
        offers: {
          orderBy: [{ selected: "desc" }, { createdAt: "asc" }],
          include: { vendor: { select: { ico: true, name: true, email: true } } },
        },
      },
    }),
    prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        parentId: true,
        title: true,
        assigneeEmail: true,
        startDate: true,
        dueDate: true,
        status: true,
        subProjectId: true,
        priority: true,
        profession: true,
        estimateDays: true,
        percentDone: true,
        vendorId: true,
        vendor: { select: { ico: true, email: true } },
        dependsOn: { select: { dependsOnId: true } },
      },
    }),
    prisma.expense.findMany({
      where: { projectId: project.id },
      orderBy: { date: "asc" },
      include: { vendor: { select: { ico: true, email: true } } },
    }),
  ]);

  // Sbírka dodavatelů použitých v plánu (z evidence) – z nabídek, výdajů i úkolů.
  const vendorIds = new Set<string>();
  for (const r of requests) for (const o of r.offers) if (o.vendorId) vendorIds.add(o.vendorId);
  for (const e of expenses) if (e.vendorId) vendorIds.add(e.vendorId);
  for (const t of tasks) if (t.vendorId) vendorIds.add(t.vendorId);
  const [vendors, avail] = await Promise.all([
    vendorIds.size
      ? prisma.vendor.findMany({
          where: { id: { in: [...vendorIds] }, ownerId: project.ownerId },
          select: { id: true, ico: true, name: true, dic: true, email: true, address: true },
        })
      : Promise.resolve([]),
    vendorIds.size
      ? prisma.vendorAvailability.findMany({
          where: { vendorId: { in: [...vendorIds] } },
          select: { vendorId: true, date: true, available: true },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const availByVendor = new Map<string, { datum: string; dostupny: boolean }[]>();
  for (const a of avail) {
    const arr = availByVendor.get(a.vendorId) ?? [];
    arr.push({ datum: a.date.toISOString().slice(0, 10), dostupny: a.available });
    availByVendor.set(a.vendorId, arr);
  }

  const dodavatele: PlanVendor[] = vendors.map((v) => ({
    ico: v.ico ?? null,
    nazev: v.name,
    dic: v.dic ?? null,
    email: v.email ?? null,
    adresa: v.address ?? null,
    dostupnost: availByVendor.get(v.id),
  }));

  const phases = tasks.filter((t) => t.kind === "phase");
  const childTasks = tasks.filter((t) => t.kind !== "phase" && t.parentId);
  const looseTasks = tasks.filter((t) => t.kind !== "phase" && !t.parentId);

  const taskToPlan = (t: (typeof tasks)[number]) => ({
    id: t.id,
    ref: t.id,
    nazev: t.title,
    komu: t.assigneeEmail ?? null,
    start: isoDate(t.startDate),
    termin: isoDate(t.dueDate),
    stav: t.status,
    slozkaRef: t.subProjectId ?? null,
    priorita: t.priority ?? null,
    profese: t.profession ?? null,
    odhadDni: t.estimateDays ?? null,
    hotovoProcent: t.percentDone ?? null,
    dodavatelIco: t.vendor?.ico ?? null,
    dodavatelEmail: t.vendor?.email ?? null,
    navazuje: t.dependsOn.map((d) => d.dependsOnId),
  });

  const plan: ProjectPlan = {
    dmsPlan: PLAN_VERSION,
    exportedAt: new Date().toISOString(),
    projekt: { id: project.id, nazev: project.name, typ: project.type },
    dodavatele,
    slozky: subs.map((s) => ({
      id: s.id,
      ref: s.id,
      nazev: s.name,
      rodicRef: s.parentId ?? null,
      popis: s.description ?? null,
    })),
    zadanky: requests.map((r) => ({
      id: r.id,
      ref: r.id,
      nazev: r.title,
      popis: r.description ?? null,
      start: isoDate(r.startDate),
      termin: isoDate(r.requiredDate),
      stav: r.status,
      slozkaRef: r.subProjectId ?? null,
      ukolRef: r.taskId ?? null,
      dodaciLhutaDny: r.leadDays ?? null,
      mnozstvi: r.quantity != null ? Number(r.quantity) : null,
      jednotka: r.unit,
      kategorie: r.category,
      nabidky: r.offers.map((o) => ({
        id: o.id,
        ref: o.id,
        dodavatelIco: o.vendor?.ico ?? null,
        dodavatelNazev: o.vendor?.name ?? o.vendorName ?? null,
        dodavatelEmail: o.vendor?.email ?? null,
        cena: o.price != null ? Number(o.price) : null,
        terminDodani: isoDate(o.deliveryDate),
        body: o.score ?? null,
        hodnoceni: o.rating ?? null,
        komentar: o.note ?? null,
        stav: o.status,
        vybrana: o.selected,
      })),
    })),
    faze: phases.map((p) => ({
      ...taskToPlan(p),
      ukoly: childTasks.filter((t) => t.parentId === p.id).map(taskToPlan),
    })),
    ukoly: looseTasks.map(taskToPlan),
    vydaje: expenses.map((e) => ({
      id: e.id,
      nazev: e.title,
      castka: Number(e.amount),
      mena: e.currency,
      kategorie: e.category,
      datum: isoDate(e.date),
      dodavatelIco: e.vendor?.ico ?? null,
      dodavatelEmail: e.vendor?.email ?? null,
      slozkaRef: e.subProjectId ?? null,
      ukolRef: e.taskId ?? null,
      zadankaRef: e.requestId ?? null,
      nabidkaRef: e.offerId ?? null,
    })),
  };

  const safe = project.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  const body = JSON.stringify(plan, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="plan-${safe || "projekt"}.json"`,
    },
  });
}
