import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { evalFormula, formulaVariables } from "@/lib/formula";

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
const row = (v: (string | number | null | undefined)[]) =>
  v.map((x) => csvField(x == null ? "" : String(x))).join(";");

/** Z uloženého vzorce spotřeby zrekonstruuje (spotřeba, základna) pro CSV. */
function recoverConsumption(formula: string): { consumption: number; basis: string } {
  let vars: string[] = [];
  try {
    vars = formulaVariables(formula);
  } catch {
    return { consumption: 0, basis: "AREA" };
  }
  const ev = (v: Record<string, number>) => {
    try {
      return evalFormula(formula, v);
    } catch {
      return 0;
    }
  };
  if (vars.includes("delka_radu")) return { consumption: ev({ delka_radu: 1, mnozstvi: 0, vyska: 0 }), basis: "BASE_LENGTH" };
  if (vars.includes("vyska")) return { consumption: ev({ vyska: 1, mnozstvi: 0, delka_radu: 0 }), basis: "PER_COURSE" };
  return { consumption: ev({ mnozstvi: 1, delka_radu: 0, vyska: 0 }), basis: "AREA" };
}

const PROMPT = `# Šablona katalogu Procesních tabulek (DMS) + prompt pro AI

Tento soubor slouží k rozšíření katalogu pomocí AI. Zkopíruj ho celý do
chatu s AI (Claude apod.) spolu s pokynem níže. AI vrátí nové řádky ve
stejném formátu, které pak v DMS naimportuješ (Import & export → Katalog).

## Prompt pro AI

> Jsi odhadce stavebních prací. Doplň katalog stavebních materiálů, úkonů a
> jejich receptů (spotřeba materiálu) ve formátu CSV níže. Drž se PŘESNĚ
> stejných sloupců a oddělovače (středník \`;\`), desetinná tečka, kódování
> UTF-8. Kódy (\`code\`) musí být unikátní a stručné (např. \`ZED-PTH30\`).
> Ceny uváděj orientační bez DPH k aktuálnímu roku, normohodiny a spotřeby
> dle běžných stavebních zvyklostí. U materiálů zachovej řádky \`# kategorie\`
> jako oddělovače sekcí. Vrať tři bloky: materials, tasks, task_materials.

## Formát

- **materials.csv** — \`code;name;unit_code;weight_per_unit;price;supplier;price_updated;note\`
  Řádky začínající \`#\` jsou kategorie pro následující materiály.
- **tasks.csv** — \`code;name;unit_code;labor_hours;labor_rate;course_height;note\`
  \`labor_hours\` = normohodiny na 1 MJ úkonu, \`labor_rate\` = Kč/h.
- **task_materials.csv** — \`task_code;material_code;consumption;consumption_basis;waste_factor;note\`
  \`consumption_basis\`: \`AREA\` (na MJ úkonu), \`BASE_LENGTH\` (na bm spodní řady),
  \`FIXED\` (na zadané množství), \`PER_COURSE\` (na řadu). \`waste_factor\` = např.
  1.05 pro 5% prořez.

> Pozn.: V DMS se spotřeba ukládá jako vzorec nad parametry úkonu
> (\`mnozstvi\`, \`delka_radu\`, \`vyska\`). Export níže ho zpětně převádí na
> \`consumption\`/\`consumption_basis\` (PER_COURSE je orientační).

`;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const [materials, operations] = await Promise.all([
    prisma.material.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.operation.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { materials: { include: { material: { select: { code: true } } } } },
    }),
  ]);

  // materials.csv (s kategoriemi jako # hlavičkami)
  const matLines = ["code;name;unit_code;weight_per_unit;price;supplier;price_updated;note"];
  let lastCat = "";
  for (const m of materials) {
    if (m.category && m.category !== lastCat) {
      matLines.push(`# ${m.category}`);
      lastCat = m.category;
    }
    matLines.push(
      row([m.code, m.name, m.unit, "", Number(m.unitPrice), m.priceSource, m.priceDate ? m.priceDate.toISOString().slice(0, 10) : "", m.note]),
    );
  }

  // tasks.csv
  const taskLines = ["code;name;unit_code;labor_hours;labor_rate;course_height;note"];
  lastCat = "";
  for (const o of operations) {
    if (o.category && o.category !== lastCat) {
      taskLines.push(`# ${o.category}`);
      lastCat = o.category;
    }
    let laborHours: number | string = "";
    try {
      laborHours = Math.round(evalFormula(o.laborFormula, { mnozstvi: 1, delka_radu: 0, vyska: 0 }) * 1000) / 1000;
    } catch {
      laborHours = "";
    }
    taskLines.push(row([o.code, o.name, o.unit, laborHours, o.laborRate != null ? Number(o.laborRate) : "", "", o.description]));
  }

  // task_materials.csv
  const tmLines = ["task_code;material_code;consumption;consumption_basis;waste_factor;note"];
  for (const o of operations) {
    for (const r of o.materials) {
      const { consumption, basis } = recoverConsumption(r.quantityFormula);
      const wf = r.wastePct != null ? Math.round((1 + Number(r.wastePct) / 100) * 1000) / 1000 : "";
      tmLines.push(row([o.code, r.material.code, Math.round(consumption * 1000) / 1000, basis, wf, r.note]));
    }
  }

  const empty = materials.length === 0 && operations.length === 0;
  const body =
    PROMPT +
    (empty ? "> Katalog je zatím prázdný – níže jsou jen hlavičky jako vzor.\n\n" : "") +
    "## materials.csv\n\n```csv\n" + matLines.join("\n") + "\n```\n\n" +
    "## tasks.csv\n\n```csv\n" + taskLines.join("\n") + "\n```\n\n" +
    "## task_materials.csv\n\n```csv\n" + tmLines.join("\n") + "\n```\n";

  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dms-katalog-sablona.md"',
    },
  });
}
