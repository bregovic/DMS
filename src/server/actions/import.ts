"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";

export type ImportSummary = {
  created: number;
  skipped: number;
  newProjects: number;
  newVendors: number;
};

export type ImportState = { error?: string; summary?: ImportSummary } | undefined;

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/\s/g, "").replace(",", "."));
}

function parseCzDate(s: string): Date {
  // očekává DD.MM.YYYY; fallback na Date() parsing nebo dnešek
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function importExpensesCsv(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Vyber CSV soubor." };
  }

  const rows = parseCsv(await file.text());
  if (rows.length < 2) {
    return { error: "Soubor je prázdný nebo neobsahuje data." };
  }

  const header = rows[0].map(norm);
  const col = (name: string) => header.indexOf(norm(name));
  const ci = {
    date: col("Datum"),
    email: col("Email"),
    vendor: col("Název dodavatele"),
    desc: col("Popis položky"),
    cat: col("Kategorie"),
    amount: col("Částka"),
    currency: col("Měna"),
    project: col("Projekt"),
  };

  if (ci.project < 0 || ci.amount < 0) {
    return { error: "Chybí povinné sloupce Projekt a Částka." };
  }

  const get = (r: string[], idx: number) => (idx >= 0 ? (r[idx] ?? "").trim() : "");

  const projectCache = new Map<string, string>();
  const vendorCache = new Map<string, string>();
  let created = 0;
  let skipped = 0;
  let newProjects = 0;
  let newVendors = 0;

  for (const r of rows.slice(1)) {
    const projectName = get(r, ci.project);
    const amount = parseAmount(get(r, ci.amount));
    if (!projectName || !isFinite(amount)) {
      skipped++;
      continue;
    }

    // Projekt (najdi/vytvoř)
    const pKey = projectName.toLowerCase();
    let projectId = projectCache.get(pKey);
    if (!projectId) {
      const existing = await prisma.project.findFirst({
        where: { ownerId: user.id, name: projectName },
        select: { id: true },
      });
      if (existing) {
        projectId = existing.id;
      } else {
        const p = await prisma.project.create({
          data: { ownerId: user.id, name: projectName, type: "other" },
          select: { id: true },
        });
        projectId = p.id;
        newProjects++;
      }
      projectCache.set(pKey, projectId);
    }

    // Dodavatel (volitelně, podle e-mailu)
    let vendorId: string | null = null;
    const email = get(r, ci.email);
    if (email) {
      const vKey = email.toLowerCase();
      vendorId = vendorCache.get(vKey) ?? null;
      if (!vendorId) {
        const existing = await prisma.vendor.findFirst({
          where: { ownerId: user.id, email },
          select: { id: true },
        });
        if (existing) {
          vendorId = existing.id;
        } else {
          const v = await prisma.vendor.create({
            data: {
              ownerId: user.id,
              email,
              name: get(r, ci.vendor) || email,
              category: "other",
            },
            select: { id: true },
          });
          vendorId = v.id;
          newVendors++;
        }
        vendorCache.set(vKey, vendorId);
      }
      // Přiřaď dodavatele k projektu (idempotentní)
      await prisma.project
        .update({
          where: { id: projectId },
          data: { vendors: { connect: { id: vendorId } } },
        })
        .catch(() => {});
    }

    const cat = get(r, ci.cat);
    await prisma.expense.create({
      data: {
        projectId,
        vendorId,
        createdById: user.id,
        title: get(r, ci.desc) || "Výdaj",
        amount,
        currency: get(r, ci.currency) || "CZK",
        category: "other",
        date: parseCzDate(get(r, ci.date)),
        description: cat ? `Kategorie: ${cat}` : undefined,
      },
    });
    created++;
  }

  revalidatePath("/projects");
  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  return { summary: { created, skipped, newProjects, newVendors } };
}
