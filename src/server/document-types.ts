import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DOCUMENT_TYPES } from "@/lib/constants";

export type DocTypeOption = { value: string; label: string };

/** Vestavěné typy dokumentů + vlastní z DB (cache dedupuje v rámci renderu). */
export const getDocumentTypes = cache(async (): Promise<DocTypeOption[]> => {
  const custom = await prisma.documentType.findMany({
    orderBy: { label: "asc" },
  });
  return [
    ...DOCUMENT_TYPES.map((d) => ({ value: d.value, label: d.label })),
    ...custom.map((d) => ({ value: d.key, label: d.label })),
  ];
});

export async function getDocumentTypeMap(): Promise<Map<string, string>> {
  const types = await getDocumentTypes();
  return new Map(types.map((t) => [t.value, t.label]));
}

export function slugifyDocType(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `d-${base || "typ"}`;
}

/** Najde existující typ podle labelu/keye, nebo vytvoří nový a vrátí jeho key. */
export async function resolveDocTypeKey(input: string): Promise<string> {
  const v = input.trim();
  if (!v) return "other";
  // shoda s vestavěným (podle value nebo labelu)
  const builtin = DOCUMENT_TYPES.find(
    (d) => d.value === v || d.label.toLowerCase() === v.toLowerCase(),
  );
  if (builtin) return builtin.value;
  // shoda s existujícím custom (podle key nebo labelu)
  const existing = await prisma.documentType.findFirst({
    where: { OR: [{ key: v }, { label: { equals: v, mode: "insensitive" } }] },
    select: { key: true },
  });
  if (existing) return existing.key;
  // vytvoř nový
  const key = slugifyDocType(v);
  await prisma.documentType.upsert({
    where: { key },
    update: { label: v },
    create: { key, label: v },
  });
  return key;
}
