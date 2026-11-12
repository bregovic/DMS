import { prisma } from "@/lib/prisma";

/**
 * Správce aplikace – smí měnit společné číselníky (přejmenovat, smazat),
 * které vidí všichni uživatelé. ADMIN_EMAILS (čárkou), jinak první
 * založený účet.
 */
export async function isAppAdmin(user: { id: string; email?: string | null }) {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length) return !!user.email && list.includes(user.email.toLowerCase());
  const first = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return first?.id === user.id;
}
