import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { BUILTIN_PROJECT_TYPES } from "@/lib/constants";

export type ProjectTypeOption = { key: string; label: string };

/** Vestavěné typy + vlastní z DB (cache dedupuje v rámci renderu). */
export const getProjectTypes = cache(
  async (): Promise<ProjectTypeOption[]> => {
    const custom = await prisma.projectType.findMany({
      orderBy: { label: "asc" },
    });
    return [
      ...BUILTIN_PROJECT_TYPES.map((t) => ({ key: t.key, label: t.label })),
      ...custom.map((t) => ({ key: t.key, label: t.label })),
    ];
  },
);

/** Mapa key -> label pro zobrazení názvu typu. */
export async function getProjectTypeMap(): Promise<Map<string, string>> {
  const types = await getProjectTypes();
  return new Map(types.map((t) => [t.key, t.label]));
}

/** Vytvoří klíč (slug) z názvu typu. */
export function slugifyType(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // odstraní diakritiku
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `c-${base || "typ"}`;
}
