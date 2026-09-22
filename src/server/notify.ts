import { prisma } from "@/lib/prisma";
import { REQUEST_HANDLED_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { mailTemplate, para, sendMail } from "@/lib/mailer";

/**
 * Oznámení (zvoneček v hlavičce). Interní modul – volá se ze serverových
 * akcí po kontrole oprávnění.
 *
 * Druhy: task_assigned (přidělený úkol), expense_added (výdaj od někoho
 * jiného v mém projektu), reminder (po termínu, fáze se blíží, objednat do),
 * invoice_requested / invoice_paid (žádost o úhradu a její zaplacení).
 * dedupeKey brání opakovanému založení téhož (unikátní s userId).
 */
type N = { kind: string; title: string; body?: string | null; href?: string | null; projectId?: string | null; dedupeKey?: string | null };

export async function notifyUsers(userIds: string[], n: N) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const created = await prisma.notification
    .createMany({
      data: ids.map((userId) => ({
        userId,
        kind: n.kind,
        title: n.title.slice(0, 300),
        body: n.body?.slice(0, 1000) ?? null,
        href: n.href ?? null,
        projectId: n.projectId ?? null,
        dedupeKey: n.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    })
    .catch(() => null);
  // dedupeKey zahodil duplicity – pak už není co posílat (připomínky by jinak
  // chodily každý den znovu).
  if (created && created.count > 0) await emailNotification(ids, n);
}

/**
 * Oznámení i e-mailem, komu si to zapnul v Nastavení (#41). Odeslání nesmí
 * shodit akci, kvůli které vzniklo – případná chyba se jen spolkne.
 */
async function emailNotification(userIds: string[], n: N) {
  const users = await prisma.user
    .findMany({
      where: { id: { in: userIds }, notifyByEmail: true },
      select: { id: true, email: true, notifyEmail: true },
    })
    .catch(() => []);
  if (!users.length) return;
  const base = process.env.APP_URL || "https://dokumenty.up.railway.app";
  const { html, text } = mailTemplate({
    title: n.title,
    lines: n.body ? [para(n.body)] : [],
    action: n.href ? { label: "Otevřít v DMS", href: `${base}${n.href}` } : undefined,
  });
  await Promise.all(
    users.map((u) => {
      const to = u.notifyEmail || u.email;
      return to ? sendMail({ to, subject: `DMS – ${n.title}`, html, text }).catch(() => undefined) : undefined;
    }),
  );
}

async function usersByEmail(emails: string[]) {
  const list = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  if (!list.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { OR: list.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })) },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.email!.toLowerCase(), u.id]));
}

/** Úkol přidělený dodavateli (podle jeho e-mailu) nebo řešiteli → oznámení jim. */
export async function notifyTaskAssigned(taskIds: string[], actorId: string) {
  if (!taskIds.length) return;
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: {
      id: true,
      title: true,
      kind: true,
      dueDate: true,
      projectId: true,
      assigneeEmail: true,
      vendor: { select: { email: true } },
      project: { select: { name: true } },
    },
  });
  const byEmail = await usersByEmail(tasks.flatMap((t) => [t.vendor?.email ?? "", t.assigneeEmail ?? ""]));
  for (const t of tasks) {
    for (const email of [t.vendor?.email, t.assigneeEmail]) {
      const uid = email ? byEmail.get(email.toLowerCase()) : undefined;
      if (!uid || uid === actorId) continue;
      await notifyUsers([uid], {
        kind: "task_assigned",
        title: `Přidělený úkol: ${t.title}`,
        body: `${t.project.name}${t.dueDate ? ` · termín ${t.dueDate.toLocaleDateString("cs-CZ")}` : ""}`,
        href: "/ukoly",
        projectId: t.projectId,
        dedupeKey: `assigned:${t.id}:${email!.toLowerCase()}`,
      });
    }
  }
}

/** Výdaj, který do projektu přidal někdo jiný → oznámení vlastníkovi a spolusprávcům. */
export async function notifyExpenseAdded(expenseIds: string[], actorId: string) {
  if (!expenseIds.length) return;
  const exps = await prisma.expense.findMany({
    where: { id: { in: expenseIds } },
    select: {
      id: true,
      title: true,
      amount: true,
      currency: true,
      projectId: true,
      createdBy: { select: { name: true, email: true } },
      project: { select: { name: true, ownerId: true, memberships: { where: { role: "member" }, select: { email: true } } } },
    },
  });
  for (const e of exps) {
    const members = await usersByEmail(e.project.memberships.map((m) => m.email));
    const to = [e.project.ownerId, ...members.values()].filter((id) => id !== actorId);
    await notifyUsers(to, {
      kind: "expense_added",
      title: `Nový výdaj: ${e.title} – ${formatCurrency(Number(e.amount), e.currency)}`,
      body: `${e.project.name} · přidal ${e.createdBy.name ?? e.createdBy.email ?? "?"}`,
      href: `/projects/${e.projectId}`,
      projectId: e.projectId,
      dedupeKey: `expense:${e.id}`,
    });
  }
}

const REMINDER_EVERY_MS = 3 * 60 * 60 * 1000;

/**
 * Připomínky – generují se líně při načtení aplikace, nejvýš jednou za 3 h:
 *  - úkoly po termínu (moje přidělené; ve vlastních projektech souhrnně za projekt a den),
 *  - fáze začínající do 7 dní bez dodavatele,
 *  - žádanky, které už měly být objednané (objednat do),
 *  - nezaplacené faktury po splatnosti (pro plátce).
 */
export async function ensureReminders(user: { id: string; email?: string | null }) {
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { remindersAt: true } });
  if (me?.remindersAt && Date.now() - me.remindersAt.getTime() < REMINDER_EVERY_MS) return;
  await prisma.user.update({ where: { id: user.id }, data: { remindersAt: new Date() } });

  const email = user.email?.toLowerCase() ?? "";
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayKey = today.toISOString().slice(0, 10);
  const DAY = 86400000;
  const open = { status: { notIn: TASK_DONE_STATUSES } };

  // 1) moje přidělené úkoly po termínu
  if (email) {
    const mine = await prisma.task.findMany({
      where: {
        ...open,
        kind: { in: ["task", "todo"] },
        dueDate: { lt: today },
        OR: [{ assigneeEmail: email }, { vendor: { email: { equals: email, mode: "insensitive" } } }],
      },
      select: { id: true, title: true, dueDate: true, projectId: true },
      take: 50,
    });
    for (const t of mine)
      await notifyUsers([user.id], {
        kind: "reminder",
        title: `Po termínu: ${t.title}`,
        body: `termín byl ${t.dueDate!.toLocaleDateString("cs-CZ")}`,
        href: "/ukoly",
        projectId: t.projectId,
        dedupeKey: `overdue-mine:${t.id}:${t.dueDate!.toISOString().slice(0, 10)}`,
      });
  }

  // 2) vlastní projekty: souhrn úkolů po termínu (1× denně za projekt)
  const owned = await prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } });
  for (const p of owned) {
    const late = await prisma.task.count({
      where: { projectId: p.id, ...open, kind: { in: ["task", "todo"] }, dueDate: { lt: today } },
    });
    if (late > 0)
      await notifyUsers([user.id], {
        kind: "reminder",
        title: `${p.name}: ${late} ${late === 1 ? "úkol je" : late < 5 ? "úkoly jsou" : "úkolů je"} po termínu`,
        href: `/projects/${p.id}/planning`,
        projectId: p.id,
        dedupeKey: `overdue-project:${p.id}:${dayKey}`,
      });

    // 3) fáze začínající do 7 dní bez dodavatele
    const soon = await prisma.task.findMany({
      where: {
        projectId: p.id,
        kind: "phase",
        ...open,
        startDate: { gte: today, lte: new Date(today.getTime() + 7 * DAY) },
        vendorId: null,
        selfPerformed: false,
      },
      select: { id: true, title: true, startDate: true, children: { select: { vendorId: true, selfPerformed: true, assigneeEmail: true } } },
    });
    for (const ph of soon) {
      if (ph.children.length && ph.children.every((k) => k.vendorId || k.selfPerformed || k.assigneeEmail)) continue;
      await notifyUsers([user.id], {
        kind: "reminder",
        title: `Fáze ${ph.title} začíná ${ph.startDate!.toLocaleDateString("cs-CZ")} a nemá dodavatele`,
        href: `/projects/${p.id}/planning`,
        projectId: p.id,
        dedupeKey: `phase-soon:${ph.id}:${ph.startDate!.toISOString().slice(0, 10)}`,
      });
    }

    // 4) žádanky, které už měly být objednané
    const reqs = await prisma.request.findMany({
      where: { projectId: p.id, status: { notIn: REQUEST_HANDLED_STATUSES }, leadDays: { not: null } },
      select: { id: true, title: true, leadDays: true, requiredDate: true, task: { select: { startDate: true } } },
    });
    for (const r of reqs) {
      const base = r.task?.startDate ?? r.requiredDate;
      if (!base || r.leadDays == null) continue;
      const orderBy = new Date(base.getTime() - r.leadDays * DAY);
      if (orderBy >= today) continue;
      await notifyUsers([user.id], {
        kind: "reminder",
        title: `Objednat: ${r.title} (mělo být do ${orderBy.toLocaleDateString("cs-CZ")})`,
        href: `/projects/${p.id}?tab=zadanky`,
        projectId: p.id,
        dedupeKey: `order-late:${r.id}`,
      });
    }
  }

  // 5) nezaplacené faktury po splatnosti (pro plátce)
  const due = await prisma.invoice.findMany({
    where: { recipientId: user.id, status: "requested", dueDate: { lt: today } },
    select: { id: true, number: true, amount: true, currency: true },
  });
  for (const i of due)
    await notifyUsers([user.id], {
      kind: "reminder",
      title: `Faktura ${i.number} je po splatnosti (${formatCurrency(Number(i.amount), i.currency)})`,
      href: `/faktury/${i.id}`,
      dedupeKey: `invoice-due:${i.id}`,
    });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
