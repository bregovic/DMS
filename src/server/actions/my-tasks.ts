"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { canWrite, getProjectAccess } from "@/server/access";
import { scheduleProject } from "@/server/schedule";

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const MAX_FILE = 14 * 1024 * 1024;

type SessionUser = { id: string; email?: string | null };
type LogInput = {
  hours: number | null;
  rate: number | null;
  amount: number | null;
  percent: number | null;
  expectedEnd: Date | null;
  date: Date;
  note: string;
  files: File[];
};

/**
 * Vykázání na jeden úkol: práce (hodiny × sazba) nebo částka, % hotovo,
 * předpokládané dokončení a přílohy (fotky, účtenky). Smí dodavatel úkolu
 * (podle e-mailu), řešitel, nebo kdo smí do projektu zapisovat.
 * Vrací, kterou složku projektu je potřeba přeplánovat.
 */
async function logOne(user: SessionUser, taskId: string, inp: LogInput) {
  const email = user.email?.toLowerCase() ?? "";
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      subProjectId: true,
      assigneeEmail: true,
      vendorId: true,
      actualStart: true,
      startDate: true,
      vendor: { select: { email: true } },
      project: { select: { ownerId: true, defaultCategory: true, defaultCurrency: true } },
    },
  });
  if (!task) throw new Error("Úkol nenalezen.");

  const isVendor = !!email && task.vendor?.email?.toLowerCase() === email;
  const isAssignee = !!email && task.assigneeEmail?.toLowerCase() === email;
  if (!isVendor && !isAssignee) {
    const access = await getProjectAccess(task.projectId, user);
    if (!access || !canWrite(access.role)) throw new Error(`Na úkol „${task.title}“ nemůžeš vykazovat.`);
  }

  let amount: number | null = null;
  const worked = !!inp.hours && inp.hours > 0;
  if (worked) {
    if (!inp.rate || inp.rate <= 0) throw new Error("Zadej hodinovou sazbu.");
    amount = Math.round(inp.hours! * inp.rate * 100) / 100;
  } else if (inp.amount && inp.amount > 0) {
    amount = inp.amount;
  }
  const progressOnly = amount == null;
  if (progressOnly && inp.percent == null && !inp.expectedEnd && inp.files.length === 0)
    throw new Error(`U úkolu „${task.title}“ zadej hodiny, částku, % hotovo nebo termín.`);

  // Dodavatel výdaje: ten z úkolu, když jsem to já; jinak můj záznam
  // v evidenci vlastníka projektu (stejný e-mail), pokud existuje.
  let vendorId: string | null = isVendor ? task.vendorId : null;
  if (!vendorId && email) {
    const mine = await prisma.vendor.findFirst({
      where: { ownerId: task.project.ownerId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    vendorId = mine?.id ?? null;
  }

  let expenseId: string | null = null;
  if (!progressOnly || inp.files.length > 0) {
    const e = await prisma.expense.create({
      data: {
        projectId: task.projectId,
        subProjectId: task.subProjectId,
        taskId: task.id,
        title: progressOnly ? `${task.title} – podklady` : task.title,
        description: inp.note || null,
        kind: worked ? "work" : "expense",
        category: task.project.defaultCategory ?? "other",
        currency: task.project.defaultCurrency ?? "CZK",
        amount: amount ?? 0,
        hours: worked ? inp.hours : null,
        rate: worked ? inp.rate : null,
        date: inp.date,
        vendorId,
        status: "approved",
        createdById: user.id,
      },
      select: { id: true },
    });
    expenseId = e.id;
  }

  // Přílohy (fotky z práce, účtenky) k vykázání.
  for (const file of inp.files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await storage.save(buffer, file.name, `${task.project.ownerId}/${task.projectId}/receipt`);
    await prisma.document.create({
      data: {
        projectId: task.projectId,
        expenseId,
        fileName: key,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        type: "receipt",
        uploadedById: user.id,
      },
    });
  }

  // Průběh: % hotovo (100 % = hotovo), rozpracování, předpokládané dokončení.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const patch: Record<string, unknown> = {};
  if (inp.percent != null) {
    const p = Math.max(0, Math.min(100, Math.round(inp.percent)));
    patch.percentDone = p;
    if (p >= 100) {
      patch.status = "done";
      patch.actualEnd = today;
      if (!task.actualStart) patch.actualStart = task.startDate && task.startDate < today ? task.startDate : today;
    } else if (p > 0 && task.status !== "in_progress" && task.status !== "done") {
      patch.status = "in_progress";
      if (!task.actualStart) patch.actualStart = today;
    }
  } else if (worked && (task.status === "todo" || task.status === "rozhodnout")) {
    patch.status = "in_progress";
    if (!task.actualStart) patch.actualStart = today;
  }
  if (inp.expectedEnd) patch.dueDate = inp.expectedEnd;
  if (Object.keys(patch).length) await prisma.task.update({ where: { id: task.id }, data: patch });

  if (vendorId && worked && inp.rate) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { hourlyRate: inp.rate } }).catch(() => {});
  }
  return { projectId: task.projectId, subProjectId: task.subProjectId, reschedule: Object.keys(patch).length > 0 };
}

async function afterLog(results: { projectId: string; subProjectId: string | null; reschedule: boolean }[]) {
  const seen = new Set<string>();
  for (const r of results) {
    if (!r.reschedule) continue;
    const k = `${r.projectId}|${r.subProjectId ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    await scheduleProject(r.projectId, r.subProjectId);
  }
  revalidatePath("/ukoly");
  for (const p of new Set(results.map((r) => r.projectId))) {
    revalidatePath(`/projects/${p}`);
    revalidatePath(`/projects/${p}/planning`);
  }
}

function filesFrom(formData: FormData) {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const big = files.find((f) => f.size > MAX_FILE);
  if (big) throw new Error(`Soubor „${big.name}“ je větší než 14 MB.`);
  return files;
}

/**
 * Vykázání na přidělený úkol (#29): práce nebo částka, % hotovo,
 * předpokládané dokončení (přeplánuje navazující práce) a přílohy.
 */
export async function logTaskExpense(formData: FormData) {
  const user = await requireUser();
  const r = await logOne(user, String(formData.get("taskId") || ""), {
    hours: num(formData.get("hours")),
    rate: num(formData.get("rate")),
    amount: num(formData.get("amount")),
    percent: num(formData.get("percent")),
    expectedEnd: dateOrNull(formData.get("expectedEnd")),
    date: dateOrNull(formData.get("date")) ?? new Date(),
    note: String(formData.get("description") || "").trim(),
    files: filesFrom(formData),
  });
  await afterLog([r]);
}

/**
 * Vykázání na víc úkolů najednou: u každého hodiny (nebo částka) a % hotovo,
 * společné datum, sazba, poznámka a přílohy (přiloží se ke každému vykázání).
 */
export async function logTasksExpenseBulk(formData: FormData) {
  const user = await requireUser();
  const ids = formData.getAll("taskIds").map(String).filter(Boolean);
  if (ids.length === 0) throw new Error("Nevybral jsi žádný úkol.");
  const files = filesFrom(formData);
  const common = {
    rate: num(formData.get("rate")),
    date: dateOrNull(formData.get("date")) ?? new Date(),
    note: String(formData.get("description") || "").trim(),
  };
  const results = [];
  for (const id of ids) {
    const hours = num(formData.get(`hours_${id}`));
    const amount = num(formData.get(`amount_${id}`));
    const percent = num(formData.get(`percent_${id}`));
    const expectedEnd = dateOrNull(formData.get(`end_${id}`));
    if (!hours && !amount && percent == null && !expectedEnd) continue; // řádek bez údajů přeskočit
    results.push(
      await logOne(user, id, { ...common, hours, amount, percent, expectedEnd, files }),
    );
  }
  if (results.length === 0) throw new Error("Vyplň aspoň u jednoho úkolu hodiny, částku, % nebo termín.");
  await afterLog(results);
  return { logged: results.length };
}
