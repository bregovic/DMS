import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getExpenseCategoryMap } from "@/server/expense-categories";

const COLUMNS = [
  "ID",
  "Datum",
  "Email",
  "Název dodavatele",
  "Popis položky",
  "Kategorie",
  "Částka",
  "Měna",
  "Projekt",
];

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(values: string[]): string {
  return values.map(csvField).join(";");
}

function fmtDate(date: Date): string {
  const d = new Date(date);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function csvResponse(lines: string[], filename: string): Response {
  // BOM kvůli správné detekci UTF-8 v Excelu
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/export/[type]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { type } = await ctx.params;
  const header = csvRow(COLUMNS);

  if (type === "template") {
    const example = csvRow([
      "",
      "01.06.2026",
      "dodavatel@firma.cz",
      "Příklad dodavatele",
      "Příklad položky",
      "Materiál",
      "1000",
      "CZK",
      "Můj projekt",
    ]);
    return csvResponse([header, example], "dms-sablona.csv");
  }

  if (type === "expenses") {
    const [expenses, catMap] = await Promise.all([
      prisma.expense.findMany({
        where: { project: { ownerId: session.user.id } },
        orderBy: { date: "desc" },
        include: {
          project: { select: { name: true } },
          vendor: { select: { name: true, email: true } },
        },
      }),
      getExpenseCategoryMap(),
    ]);

    const lines = [header];
    for (const e of expenses) {
      lines.push(
        csvRow([
          e.id,
          fmtDate(e.date),
          e.vendor?.email ?? "",
          e.vendor?.name ?? "",
          e.title,
          catMap.get(e.category) ?? e.category,
          String(Number(e.amount)),
          e.currency,
          e.project.name,
        ]),
      );
    }
    return csvResponse(lines, "dms-vydaje.csv");
  }

  return new Response("Neznámý typ exportu", { status: 404 });
}
