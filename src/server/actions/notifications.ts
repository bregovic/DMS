"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ensureReminders, unreadCount } from "@/server/notify";

/** Počet nepřečtených oznámení (zvoneček); zároveň doplní připomínky (max 1× za 3 h). */
export async function getUnreadCount() {
  const user = await requireUser();
  await ensureReminders(user).catch(() => {});
  return unreadCount(user.id);
}

export async function markAllRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifikace");
}

export async function markRead(id: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
}
