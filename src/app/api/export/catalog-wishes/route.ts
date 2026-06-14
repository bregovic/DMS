import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
const row = (v: (string | number | null | undefined)[]) =>
  v.map((x) => csvField(x == null ? "" : String(x))).join(";");

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const [wishes, materials, operations] = await Promise.all([
    prisma.catalogWish.findMany({ where: { done: false }, orderBy: { createdAt: "asc" } }),
    prisma.material.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.operation.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);

  const wishList = wishes.length
    ? wishes.map((w) => `- ${w.title}${w.note ? ` — ${w.note}` : ""}`).join("\n")
    : "_(žádné zapsané chybějící činnosti)_";

  const matLines = ["code;name;unit_code;price;note"];
  for (const m of materials) {
    matLines.push(row([m.code, m.name, m.unit, Number(m.unitPrice), m.note]));
  }
  const opCodes = operations.map((o) => `${o.code} (${o.name})`).join(", ") || "—";

  const body = `# Doplnění chybějících činností do katalogu (DMS)

Zkopíruj celý tento soubor do chatu s AI (Claude apod.). AI doplní níže
uvedené chybějící činnosti ve formátu CSV, který pak v DMS naimportuješ
(Import & export → Katalog procesů).

## Prompt pro AI

> Jsi odhadce stavebních prací. Pro každou CHYBĚJÍCÍ ČINNOST níže vytvoř:
> 1) řádek v **tasks** (úkon: kód, název, MJ, normohodiny/MJ, sazba Kč/h),
> 2) řádky v **task_materials** (spotřeba materiálu na úkon),
> 3) případně nové **materials**, pokud potřebný materiál není v seznamu
>    existujících materiálů níže (existující materiály používej podle jejich
>    \`code\`, nevytvářej duplicitní).
> Drž PŘESNĚ formát sloupců, oddělovač \`;\`, desetinná tečka, UTF-8. Kódy
> úkonů musí být unikátní a nesmí kolidovat s existujícími kódy úkonů.
> Ceny orientační bez DPH, spotřeby a normohodiny dle běžných zvyklostí.
> Vrať tři CSV bloky: materials (jen nové), tasks, task_materials.

## Chybějící činnosti k doplnění

${wishList}

## Formát výstupu

- **materials.csv** — \`code;name;unit_code;weight_per_unit;price;supplier;price_updated;note\`
- **tasks.csv** — \`code;name;unit_code;labor_hours;labor_rate;course_height;note\`
- **task_materials.csv** — \`task_code;material_code;consumption;consumption_basis;waste_factor;note\`
  \`consumption_basis\`: \`AREA\` (na MJ úkonu), \`BASE_LENGTH\` (na bm spodní řady),
  \`FIXED\` (na zadané množství), \`PER_COURSE\` (na řadu). \`waste_factor\` např. 1.05.

## Existující kódy úkonů (nepoužívej je znovu)

${opCodes}

## Existující materiály (používej jejich code v receptech)

\`\`\`csv
${matLines.join("\n")}
\`\`\`
`;

  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dms-katalog-chybejici.md"',
    },
  });
}
