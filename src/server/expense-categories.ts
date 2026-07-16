import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

export type CategoryOption = { key: string; label: string };

/** Vestavěné kategorie + vlastní z DB (cache dedupuje v rámci renderu). */
export const getExpenseCategories = cache(
  async (): Promise<CategoryOption[]> => {
    const custom = await prisma.expenseCategory.findMany({
      orderBy: { label: "asc" },
    });
    return [
      ...EXPENSE_CATEGORIES.map((c) => ({ key: c.value, label: c.label })),
      ...custom.map((c) => ({ key: c.key, label: c.label })),
    ];
  },
);

export async function getExpenseCategoryMap(): Promise<Map<string, string>> {
  const cats = await getExpenseCategories();
  return new Map(cats.map((c) => [c.key, c.label]));
}

export function slugifyCategory(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `c-${base || "kat"}`;
}
