"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";
import {
  getExpenseCategories,
  slugifyCategory,
} from "@/server/expense-categories";

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  newProjects: number;
  newVendors: number;
  newCategories: number;
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

  // UTF-8 s fallbackem na Windows-1250 (české Excel CSV).
  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1250").decode(buf);
  }

  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "Soubor je prázdný nebo neobsahuje data." };
  }

  const header = rows[0].map(norm);
  const col = (name: string) => header.indexOf(norm(name));
  const ci = {
    id: col("ID"),
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

  const get = (r: string[], idx: number) =>
    idx >= 0 ? (r[idx] ?? "").trim() : "";

  // Cache kategorií: normalizovaný label -> key
  const catCache = new Map<string, string>();
  for (const c of await getExpenseCategories()) {
    catCache.set(norm(c.label), c.key);
  }

  const projectCache = new Map<string, string>();
  const vendorCache = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let newProjects = 0;
  let newVendors = 0;
  let newCategories = 0;

  async function resolveCategory(label: string): Promise<string> {
    if (!label) return "other";
    const nl = norm(label);
    const found = catCache.get(nl);
    if (found) return found;
    const key = slugifyCategory(label);
    await prisma.expenseCategory.upsert({
      where: { key },
      update: { label },
      create: { key, label },
    });
    catCache.set(nl, key);
    newCategories++;
    return key;
  }

  for (const r of rows.slice(1)) {
    const projectName = get(r, ci.project);
    const amount = parseAmount(get(r, ci.amount));
    if (!projectName || !isFinite(amount)) {
      skipped++;
      continue;
    }

    // Projekt
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

    // Dodavatel (volitelně)
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
      await prisma.project
        .update({
          where: { id: projectId },
          data: { vendors: { connect: { id: vendorId } } },
        })
        .catch(() => {});
    }

    const categoryKey = await resolveCategory(get(r, ci.cat));
    const data = {
      projectId,
      vendorId,
      title: get(r, ci.desc) || "Výdaj",
      amount,
      currency: get(r, ci.currency) || "CZK",
      category: categoryKey,
      date: parseCzDate(get(r, ci.date)),
    };

    // Reimport: pokud řádek nese ID existujícího výdaje uživatele → update
    const rowId = get(r, ci.id);
    let didUpdate = false;
    if (rowId) {
      const existing = await prisma.expense.findFirst({
        where: { id: rowId, project: { ownerId: user.id } },
        select: { id: true },
      });
      if (existing) {
        await prisma.expense.update({ where: { id: existing.id }, data });
        updated++;
        didUpdate = true;
      }
    }
    if (!didUpdate) {
      await prisma.expense.create({ data: { ...data, createdById: user.id } });
      created++;
    }
  }

  revalidatePath("/projects");
  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  return {
    summary: { created, updated, skipped, newProjects, newVendors, newCategories },
  };
}
