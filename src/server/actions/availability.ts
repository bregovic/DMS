"use server";

import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

function utcDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

async function ownVendor(vendorId: string) {
  const user = await requireUser();
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId, ownerId: user.id },
    select: { id: true },
  });
  if (!v) throw new Error("Dodavatel nenalezen.");
  return v;
}

/** Naplní kalendář dostupnosti: vybrané dny v týdnu v rozmezí od–do. */
export async function fillAvailability(formData: FormData) {
  const vendorId = String(formData.get("vendorId") || "");
  await ownVendor(vendorId);

  const from = utcDate(String(formData.get("from") || ""));
  const to = utcDate(String(formData.get("to") || ""));
  if (!from || !to || to < from) throw new Error("Zadej platné rozmezí dat.");

  const available = String(formData.get("available")) === "1";
  const wd = new Set(
    formData.getAll("wd").map((v) => Number(v)).filter((n) => n >= 0 && n <= 6),
  );
  if (wd.size === 0) throw new Error("Vyber alespoň jeden den v týdnu.");

  const maxDays = 800;
  let count = 0;
  for (
    let d = new Date(from);
    d <= to && count <= maxDays;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    if (!wd.has(d.getUTCDay())) continue;
    const date = new Date(d);
    await prisma.vendorAvailability.upsert({
      where: { vendorId_date: { vendorId, date } },
      create: { vendorId, date, available },
      update: { available },
    });
    count++;
  }
  return { ok: true, count };
}

/** Smaže záznamy dostupnosti v rozmezí (vrátí na "neurčeno"). */
export async function clearAvailability(formData: FormData) {
  const vendorId = String(formData.get("vendorId") || "");
  await ownVendor(vendorId);
  const from = utcDate(String(formData.get("from") || ""));
  const to = utcDate(String(formData.get("to") || ""));
  if (!from || !to || to < from) throw new Error("Zadej platné rozmezí dat.");
  const res = await prisma.vendorAvailability.deleteMany({
    where: { vendorId, date: { gte: from, lte: to } },
  });
  return { ok: true, count: res.count };
}

/** Záznamy dostupnosti v rozmezí (pro zobrazení kalendáře). */
export async function getVendorAvailability(
  vendorId: string,
  fromIso: string,
  toIso: string,
) {
  await ownVendor(vendorId);
  const from = utcDate(fromIso);
  const to = utcDate(toIso);
  if (!from || !to) return [];
  const rows = await prisma.vendorAvailability.findMany({
    where: { vendorId, date: { gte: from, lte: to } },
    select: { date: true, available: true },
  });
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    available: r.available,
  }));
}
