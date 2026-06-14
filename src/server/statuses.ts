import { prisma } from "@/lib/prisma";
import {
  REQUEST_STATUSES,
  OFFER_STATUSES,
  EXPENSE_STATUSES,
  TASK_STATUSES,
} from "@/lib/constants";
import { TASK_STATUS_COLORS } from "@/lib/status-colors";

export type StatusScope = "request" | "offer" | "expense" | "task";
export type StatusOption = { key: string; label: string; color: string | null };

const BUILTIN: Record<StatusScope, readonly { value: string; label: string }[]> = {
  request: REQUEST_STATUSES,
  offer: OFFER_STATUSES,
  expense: EXPENSE_STATUSES,
  task: TASK_STATUSES,
};

function builtinColor(scope: StatusScope, value: string): string | null {
  if (scope === "task") return TASK_STATUS_COLORS[value] ?? null;
  return null;
}

/** Vestavěné stavy + vlastní z DB (číselník StatusOption). */
export async function getStatuses(scope: StatusScope): Promise<StatusOption[]> {
  const custom = await prisma.statusOption.findMany({
    where: { scope },
    orderBy: [{ sort: "asc" }, { label: "asc" }],
  });
  return [
    ...BUILTIN[scope].map((s) => ({
      key: s.value,
      label: s.label,
      color: builtinColor(scope, s.value),
    })),
    ...custom.map((s) => ({ key: s.key, label: s.label, color: s.color })),
  ];
}

export async function getStatusMap(scope: StatusScope): Promise<Map<string, string>> {
  return new Map((await getStatuses(scope)).map((s) => [s.key, s.label]));
}

export async function getStatusColorMap(
  scope: StatusScope
): Promise<Map<string, string | null>> {
  return new Map((await getStatuses(scope)).map((s) => [s.key, s.color]));
}

export function isBuiltinStatus(scope: StatusScope, key: string): boolean {
  return BUILTIN[scope].some((s) => s.value === key);
}

export function slugifyStatus(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `s-${base || "stav"}`;
}
