import { prisma } from "@/lib/prisma";
import { evalFormula } from "@/lib/formula";
import { AI_MODEL, assertBudget, callModel } from "@/server/extraction";

/**
 * Doplnění katalogu přes AI (#35): když „Z katalogu“ nic nenajde, AI podle
 * názvu činnosti (např. „Fasáda a zateplení“) navrhne úkon – měrnou jednotku,
 * parametry, vzorce množství a normohodin, sazbu práce, partu a recept
 * materiálů s cenami dohledanými na webu (české e-shopy/ceníky). Návrh se
 * uloží až po potvrzení; stávající materiály se použijí, nové se založí.
 */

export type CatalogProposal = {
  operation: {
    code: string;
    name: string;
    unit: string;
    quantityFormula: string;
    laborFormula: string;
    laborRate: number;
    crew: number;
    techPauseDays: number | null;
    description: string;
  };
  params: { key: string; label: string; unit: string | null; defaultValue: number | null }[];
  materials: {
    existingCode: string | null;
    code: string;
    name: string;
    unit: string;
    unitPrice: number;
    priceSource: string;
    category: string;
    quantityFormula: string;
    wastePct: number | null;
  }[];
  summary: string;
  warnings: string[];
};

const n = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const SCHEMA = obj({
  operation: obj({
    code: { type: "string" },
    name: { type: "string" },
    unit: { type: "string" },
    quantityFormula: { type: "string" },
    laborFormula: { type: "string" },
    laborRate: { type: "number" },
    crew: { type: "number" },
    techPauseDays: n,
    description: { type: "string" },
  }),
  params: { type: "array", items: obj({ key: { type: "string" }, label: { type: "string" }, unit: str, defaultValue: n }) },
  materials: {
    type: "array",
    items: obj({
      existingCode: str,
      code: { type: "string" },
      name: { type: "string" },
      unit: { type: "string" },
      unitPrice: { type: "number" },
      priceSource: { type: "string" },
      category: { type: "string" },
      quantityFormula: { type: "string" },
      wastePct: n,
    }),
  },
  summary: { type: "string" },
  warnings: { type: "array", items: { type: "string" } },
});

const INSTRUCTIONS = `Jsi rozpočtář stavby v Česku. Navrhni úkon (činnost) do katalogu stavebních prací podle zadaného názvu.
Formát katalogu (dodrž ho přesně):
- operation.unit = měrná jednotka úkonu (m2, bm, m3, ks, kpl…); code = krátký kód VELKÝMI písmeny s pomlčkou (např. FAS-ETICS), name česky.
- params = vstupní parametry; klíč bez diakritiky malými písmeny. Standardně jediný parametr "mnozstvi" (Množství v MJ úkonu); další jen když opravdu pomohou (např. "tloustka" izolace v mm).
- quantityFormula = množství v MJ z parametrů (typicky "mnozstvi"); laborFormula = normohodiny celkem (např. "0.9 * mnozstvi"); povolené jsou + - * / závorky a čísla s desetinnou tečkou.
- laborFormula realisticky podle ceníků ÚRS/RTS a praxe – započítej všechny pracovní kroky (např. ETICS ~0,8–1,2 Nh/m2, zdění ~0,6–0,9 Nh/m2).
- laborRate = hodinová sazba práce v Kč (ČR 2026, bez materiálu); crew = počet lidí v partě; techPauseDays = technologická pauza po činnosti (zrání, vysychání) nebo null.
- materials = recept: spotřeba materiálu na úkon (quantityFormula z parametrů, např. "1.05 * mnozstvi" nebo "0.004 * mnozstvi" pro m3); wastePct = prořez v %.
  Když materiál odpovídá některému ze stávajících, dej jeho kód do existingCode (a jeho jednotku). Jinak nový kód, název, jednotku, category.
  unitPrice = aktuální cena za jednotku v Kč s DPH – DOHLEDEJ na webu u českých prodejců (DEK, Stavebniny, Hornbach, Bauhaus, Siko, Ptáček…); priceSource = obchod a měsíc/rok, nebo "odhad" když cenu nenajdeš.
- summary: 1–2 věty co úkon obsahuje a kolik vychází za 1 MJ; warnings: nejistoty (např. cena závisí na tloušťce izolace).`;

/** Navrhnout úkon přes AI (s vyhledáváním cen na webu). */
export async function proposeOperation(title: string, userId: string, note?: string | null): Promise<CatalogProposal> {
  const name = title.trim();
  if (name.length < 3) throw new Error("Zadej název činnosti.");
  await assertBudget(userId);
  const [materials, ops] = await Promise.all([
    prisma.material.findMany({ select: { code: true, name: true, unit: true, unitPrice: true }, orderBy: { code: "asc" }, take: 400 }),
    prisma.operation.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const { data } = await callModel<CatalogProposal>(
    AI_MODEL,
    INSTRUCTIONS,
    [
      {
        type: "input_text",
        text:
          `Činnost: ${name}` +
          (note?.trim() ? `\nUpřesnění: ${note.trim()}` : "") +
          `\n\nStávající úkony (kódy nepoužívej znovu): ${ops.map((o) => `${o.code} ${o.name}`).join("; ")}` +
          `\n\nStávající materiály (kód · název · MJ · cena):\n${materials
            .map((m) => `${m.code} · ${m.name} · ${m.unit} · ${Number(m.unitPrice)}`)
            .join("\n")}`,
      },
    ],
    "catalog",
    SCHEMA,
    { effort: "medium", maxOutput: 20_000, webSearch: true },
  );
  return validateProposal(data);
}

/** Kontrola vzorců a údajů – do katalogu nesmí jít nevyhodnotitelný vzorec. */
export function validateProposal(p: CatalogProposal): CatalogProposal {
  const keyOk = /^[a-z][a-z0-9_]*$/;
  const seen = new Set<string>();
  p.params = (p.params ?? []).filter((x) => keyOk.test(x.key) && !seen.has(x.key) && !!seen.add(x.key));
  if (!p.params.some((x) => x.key === "mnozstvi") && !p.params.length)
    p.params = [{ key: "mnozstvi", label: "Množství", unit: p.operation.unit, defaultValue: 1 }];
  const vars = Object.fromEntries(p.params.map((x) => [x.key, Number(x.defaultValue ?? 1) || 1]));
  const check = (f: string, what: string) => {
    try {
      evalFormula(f, vars);
    } catch (e) {
      throw new Error(`Vzorec ${what} („${f}“) nejde spočítat: ${e instanceof Error ? e.message : e}`);
    }
  };
  check(p.operation.quantityFormula, "množství");
  check(p.operation.laborFormula, "normohodin");
  for (const m of p.materials) check(m.quantityFormula, `materiálu ${m.name}`);
  p.operation.code = p.operation.code.toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 40) || "UKON";
  p.operation.crew = Math.max(1, Math.round(p.operation.crew || 1));
  p.operation.techPauseDays =
    p.operation.techPauseDays != null && p.operation.techPauseDays > 0 ? Math.round(p.operation.techPauseDays) : null;
  p.operation.laborRate = Math.max(0, Number(p.operation.laborRate) || 0);
  for (const m of p.materials) {
    m.unitPrice = Math.max(0, Number(m.unitPrice) || 0);
    m.wastePct = m.wastePct != null && m.wastePct >= 0 && m.wastePct < 1000 ? m.wastePct : null;
    m.category = (m.category || "other").slice(0, 60);
    m.unit = (m.unit || "ks").slice(0, 20);
  }
  return p;
}

/** Uložit potvrzený návrh do katalogu; vrátí id úkonu. */
export async function saveProposal(p: CatalogProposal, userId: string) {
  p = validateProposal(p);
  return prisma.$transaction(async (tx) => {
    // kód úkonu musí být jedinečný
    let code = p.operation.code;
    for (let i = 2; await tx.operation.findUnique({ where: { code }, select: { id: true } }); i++) code = `${p.operation.code}-${i}`;
    const op = await tx.operation.create({
      data: {
        ownerId: userId,
        code,
        name: p.operation.name.slice(0, 200),
        unit: p.operation.unit,
        quantityFormula: p.operation.quantityFormula,
        laborFormula: p.operation.laborFormula,
        laborRate: p.operation.laborRate,
        crew: p.operation.crew,
        techPauseDays: p.operation.techPauseDays,
        description: `${p.operation.description}\n(navrženo z katalogu)`.trim(),
        category: "other",
      },
      select: { id: true },
    });
    await tx.operationParam.createMany({
      data: p.params.map((x, i) => ({
        operationId: op.id,
        key: x.key,
        label: x.label,
        unit: x.unit,
        defaultValue: x.defaultValue,
        sort: i,
      })),
    });
    for (const m of p.materials) {
      let mat = m.existingCode ? await tx.material.findUnique({ where: { code: m.existingCode }, select: { id: true } }) : null;
      if (!mat) {
        let mcode = (m.code || m.name).toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 40);
        for (let i = 2; await tx.material.findUnique({ where: { code: mcode }, select: { id: true } }); i++)
          mcode = `${m.code}-${i}`;
        mat = await tx.material.create({
          data: {
            ownerId: userId,
            code: mcode,
            name: m.name.slice(0, 200),
            unit: m.unit,
            unitPrice: m.unitPrice,
            priceSource: m.priceSource.slice(0, 200),
            priceDate: new Date(),
            category: m.category || "other",
          },
          select: { id: true },
        });
      }
      await tx.operationMaterial.create({
        data: { operationId: op.id, materialId: mat.id, quantityFormula: m.quantityFormula, wastePct: m.wastePct },
      });
    }
    return op.id;
  }, { timeout: 60_000, maxWait: 10_000 }); // hodně zápisů – výchozí 5 s nestačí
}
