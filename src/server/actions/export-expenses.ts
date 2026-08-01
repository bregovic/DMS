"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, isManager } from "@/server/access";
import { getExpenseCategoryMap } from "@/server/expense-categories";
import { csvToWin1250Base64 } from "@/lib/win1250";
import { EXPENSE_EXPORTED_STAGE, expenseStageRank } from "@/lib/constants";

function csvField(v: string) {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function csvRow(vals: (string | number | null | undefined)[]) {
  return vals.map((v) => csvField(v == null ? "" : String(v))).join(";");
}
function fmtDate(d: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`;
}
function numv(v: unknown) {
  // Desetinná ČÁRKA kvůli českému Excelu (jinak bere číslo jako text).
  return v == null ? "" : String(Number(v as number)).replace(".", ",");
}

const HEADER = [
  "ID", "Datum", "Název", "Dodavatel", "IČO", "Kategorie",
  "Hodiny", "Sazba", "Částka", "Měna", "Splatnost", "VS", "Stav", "Subprojekt",
];

export type ExportResult =
  | { data: string; filename: string; count: number } // data = base64 (Windows-1250)
  | { error: string };

/** Vyexportuje zadané (aktuálně filtrované) výdaje projektu do CSV a označí je
 *  jako „exportováno" (exportedAt). Smí jen vlastník/spolusprávce projektu. */
export async function exportProjectExpenses(
  projectId: string,
  ids: string[],
): Promise<ExportResult> {
  const user = await requireUser();
  const access = await getProjectAccess(projectId, user);
  if (!access || !isManager(access.role)) {
    return { error: "Export může jen vlastník nebo spolusprávce projektu." };
  }
  const idList = [...new Set(ids)].filter(Boolean);
  if (idList.length === 0) return { error: "Nic k exportu." };

  const [expenses, catMap] = await Promise.all([
    prisma.expense.findMany({
      where: { id: { in: idList }, projectId },
      orderBy: { date: "desc" },
      include: {
        vendor: { select: { name: true, ico: true } },
        subProject: { select: { name: true } },
      },
    }),
    getExpenseCategoryMap(),
  ]);
  if (expenses.length === 0) return { error: "Nic k exportu." };

  const lines = [csvRow(HEADER)];
  for (const e of expenses) {
    lines.push(
      csvRow([
        e.id,
        fmtDate(e.date),
        e.title,
        e.vendor?.name ?? "",
        e.vendor?.ico ?? "",
        catMap.get(e.category) ?? e.category,
        numv(e.hours),
        numv(e.rate),
        numv(e.amount),
        e.currency,
        fmtDate(e.dueDate),
        e.variableSymbol ?? "",
        e.stage ?? "",
        e.subProject?.name ?? "",
      ]),
    );
  }
  // Windows-1250 (bez BOM) – český Excel to čte nativně, diakritika sedí.
  const csv = lines.join("\r\n") + "\r\n";

  /* Označit jako exportované a posunout stav – ale jen tomu, co je zatím
     „Nový". Už uhrazený výdaj se exportem nesmí vrátit v cyklu zpátky. */
  const exportedIds = expenses.map((e) => e.id);
  const toAdvance = expenses
    .filter((e) => expenseStageRank(e.stage) < expenseStageRank(EXPENSE_EXPORTED_STAGE))
    .map((e) => e.id);

  await prisma.$transaction([
    prisma.expense.updateMany({
      where: { id: { in: exportedIds }, projectId },
      data: { exportedAt: new Date() },
    }),
    ...(toAdvance.length
      ? [
          prisma.expense.updateMany({
            where: { id: { in: toAdvance }, projectId },
            data: { stage: EXPENSE_EXPORTED_STAGE },
          }),
        ]
      : []),
  ]);
  revalidatePath(`/projects/${projectId}`);

  const stamp = fmtDate(new Date()).replace(/\./g, "-");
  return {
    data: csvToWin1250Base64(csv),
    filename: `vydaje-${stamp}.csv`,
    count: expenses.length,
  };
}
