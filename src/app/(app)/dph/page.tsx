import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Podklad pro DPH (#doklady): z vytěžených dokladů sečte přijatá zdanitelná
 * plnění za období podle DUZP a připraví řádky pro kontrolní hlášení –
 * B.2 doklady nad 10 000 Kč s daní jednotlivě, B.3 zbytek souhrnně.
 *
 * Není to daňové poradenství ani hotové přiznání: je to přehled dokladů,
 * který si před podáním zkontroluješ (a chybějící údaje doplníš u výdaje).
 */

/** Hranice pro jednotlivé uvedení dokladu v kontrolním hlášení (vč. daně). */
const KH_LIMIT = 10_000;

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

function periodRange(period: string, year: number): [Date, Date, string] {
  if (period.startsWith("q")) {
    const q = Math.min(4, Math.max(1, Number(period.slice(1)) || 1));
    return [new Date(Date.UTC(year, (q - 1) * 3, 1)), new Date(Date.UTC(year, q * 3, 1)), `${q}. čtvrtletí ${year}`];
  }
  if (period === "rok") return [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1)), `rok ${year}`];
  const m = Math.min(12, Math.max(1, Number(period.replace("m", "")) || 1));
  return [new Date(Date.UTC(year, m - 1, 1)), new Date(Date.UTC(year, m, 1)), `${MONTHS[m - 1]} ${year}`];
}

export default async function VatPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; year?: string; period?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp?.year) || now.getUTCFullYear();
  const period = sp?.period || `m${now.getUTCMonth() + 1}`;
  const [from, to, periodLabel] = periodRange(period, year);
  const projectId = sp?.project || "";

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      project: { ownerId: user.id },
      ...(projectId ? { projectId } : {}),
      OR: [
        { taxDate: { gte: from, lt: to } },
        { taxDate: null, date: { gte: from, lt: to }, vatAmount: { not: null } },
      ],
    },
    orderBy: [{ taxDate: "asc" }, { date: "asc" }],
    select: {
      id: true,
      title: true,
      amount: true,
      currency: true,
      date: true,
      taxDate: true,
      docNumber: true,
      vatBase: true,
      vatAmount: true,
      vatBreakdown: true,
      supplierIco: true,
      supplierDic: true,
      deductible: true,
      project: { select: { id: true, name: true } },
      vendor: { select: { name: true, dic: true, ico: true } },
      documents: { select: { id: true }, take: 1 },
    },
  });

  const taxed = expenses.filter((e) => e.deductible && (e.vatAmount != null || e.vatBase != null));
  const skipped = expenses.filter((e) => !e.deductible && (e.vatAmount != null || e.vatBase != null));

  // souhrn po sazbách
  const byRate = new Map<number, { base: number; vat: number; count: number }>();
  for (const e of taxed) {
    const rows = (e.vatBreakdown as { rate: number; base: number; vat: number }[] | null) ?? [];
    const list = rows.length ? rows : [{ rate: 0, base: Number(e.vatBase ?? 0), vat: Number(e.vatAmount ?? 0) }];
    for (const r of list) {
      const g = byRate.get(r.rate) ?? { base: 0, vat: 0, count: 0 };
      g.base += Number(r.base);
      g.vat += Number(r.vat);
      g.count += 1;
      byRate.set(r.rate, g);
    }
  }
  const totalBase = [...byRate.values()].reduce((a, r) => a + r.base, 0);
  const totalVat = [...byRate.values()].reduce((a, r) => a + r.vat, 0);

  // kontrolní hlášení: B.2 jednotlivě, B.3 souhrnně
  const dicOf = (e: (typeof taxed)[number]) => e.supplierDic ?? e.vendor?.dic ?? null;
  const b2 = taxed.filter((e) => Number(e.amount) >= KH_LIMIT && dicOf(e));
  const b3 = taxed.filter((e) => !(Number(e.amount) >= KH_LIMIT && dicOf(e)));
  const b3Sum = b3.reduce(
    (a, e) => ({ base: a.base + Number(e.vatBase ?? 0), vat: a.vat + Number(e.vatAmount ?? 0) }),
    { base: 0, vat: 0 },
  );

  // na co upozornit
  const problems: { id: string; title: string; what: string }[] = [];
  const seen = new Map<string, string>();
  for (const e of taxed) {
    const miss: string[] = [];
    if (!dicOf(e)) miss.push("DIČ dodavatele");
    if (!e.docNumber) miss.push("číslo dokladu");
    if (!e.taxDate) miss.push("DUZP");
    if (e.vatBase == null || e.vatAmount == null) miss.push("základ nebo daň");
    if (e.currency !== "CZK") miss.push(`měna ${e.currency}`);
    const key = `${e.supplierIco ?? e.vendor?.ico ?? "?"}|${e.docNumber ?? ""}`;
    if (e.docNumber && seen.has(key)) miss.push("stejné číslo dokladu už v období je");
    if (e.docNumber) seen.set(key, e.id);
    if (miss.length) problems.push({ id: e.id, title: e.title, what: miss.join(", ") });
  }

  const href = (over: Record<string, string>) => {
    const u = new URLSearchParams({ year: String(year), period, ...(projectId ? { project: projectId } : {}), ...over });
    return `/dph?${u.toString()}`;
  };
  const chip = (active: boolean) =>
    `border px-2 py-0.5 text-[11px] uppercase tracking-wide transition-colors ${
      active ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-500 hover:border-stone-950"
    }`;
  const years = [year + 1, year, year - 1, year - 2].filter((y, i, a) => a.indexOf(y) === i && y <= now.getUTCFullYear() + 1);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-stone-300/80 pb-6">
        <div>
          <h1 className="display text-4xl text-stone-950">DPH</h1>
          <p className="kicker mt-1">přijatá plnění podle DUZP · {periodLabel}</p>
        </div>
        <Link
          href={`/api/export/dph?year=${year}&period=${period}${projectId ? `&project=${projectId}` : ""}`}
          className="flex h-10 items-center border border-stone-300 px-4 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
        >
          Stáhnout CSV
        </Link>
      </header>

      <div className="mb-6 space-y-2 border border-stone-200 bg-white p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 w-14">Období</span>
          {[1, 2, 3, 4].map((q) => (
            <Link key={q} href={href({ period: `q${q}` })} className={chip(period === `q${q}`)}>
              {q}. čtvrtletí
            </Link>
          ))}
          <Link href={href({ period: "rok" })} className={chip(period === "rok")}>
            Celý rok
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 w-14">Měsíc</span>
          {MONTHS.map((m, i) => (
            <Link key={m} href={href({ period: `m${i + 1}` })} className={chip(period === `m${i + 1}`)}>
              {m.slice(0, 3)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 w-14">Rok</span>
          {years.map((y) => (
            <Link key={y} href={href({ year: String(y) })} className={chip(year === y)}>
              {y}
            </Link>
          ))}
          <span className="kicker mx-1 ml-4">Projekt</span>
          <Link href={href({ project: "" })} className={chip(!projectId)}>
            Všechny
          </Link>
          {projects.map((p) => (
            <Link key={p.id} href={href({ project: p.id })} className={chip(projectId === p.id)}>
              {p.name}
            </Link>
          ))}
        </div>
      </div>

      {taxed.length === 0 ? (
        <EmptyState
          title="Za období nejsou doklady s DPH"
          description="Nahraj účtenky a faktury v projektu (Výdaje → Doklady). Systém z nich přečte základ, daň a DUZP a objeví se tady."
        />
      ) : (
        <>
          <section className="mb-8">
            <h2 className="kicker mb-2">Souhrn – přijatá zdanitelná plnění</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-stone-500">
                  <th className="py-2 font-medium">Sazba</th>
                  <th className="py-2 text-right font-medium">Základ</th>
                  <th className="py-2 text-right font-medium">Daň</th>
                  <th className="py-2 text-right font-medium">Dokladů</th>
                </tr>
              </thead>
              <tbody>
                {[...byRate.entries()]
                  .sort((a, b) => b[0] - a[0])
                  .map(([rate, r]) => (
                    <tr key={rate} className="border-b border-stone-100">
                      <td className="py-2">{rate} %</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(r.base)}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(r.vat)}</td>
                      <td className="py-2 text-right text-stone-500">{r.count}</td>
                    </tr>
                  ))}
                <tr className="border-t-2 border-stone-950 font-medium">
                  <td className="py-2">Celkem</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(totalBase)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(totalVat)}</td>
                  <td className="py-2 text-right text-stone-500">{taxed.length}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-stone-400">
              Nárok na odpočet u přijatých plnění (řádky 40 a 41 přiznání). Doklady bez DPH a označené „nezahrnovat“ se
              nepočítají{skipped.length ? ` (${skipped.length} vynechaných)` : ""}.
            </p>
          </section>

          {problems.length > 0 && (
            <section className="mb-8 border border-amber-300 bg-amber-50 p-3">
              <h2 className="kicker mb-2 !text-amber-900">Před podáním doplnit · {problems.length}</h2>
              <ul className="space-y-1 text-xs text-amber-900">
                {problems.slice(0, 20).map((p) => (
                  <li key={p.id}>
                    {p.title} – chybí {p.what}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mb-8">
            <h2 className="kicker mb-1">Kontrolní hlášení · oddíl B.2 (doklady od {formatCurrency(KH_LIMIT)})</h2>
            <p className="mb-2 text-[11px] text-stone-400">
              Jednotlivě se uvádí doklad s daní od 10 000 Kč včetně daně, u kterého známe DIČ dodavatele.
            </p>
            {b2.length === 0 ? (
              <p className="text-sm text-stone-500">Žádný doklad do B.2.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="border-b border-stone-300 text-left text-stone-500">
                      <th className="py-2 font-medium">DIČ dodavatele</th>
                      <th className="py-2 font-medium">Číslo dokladu</th>
                      <th className="py-2 font-medium">DUZP</th>
                      <th className="py-2 font-medium">Doklad</th>
                      <th className="py-2 text-right font-medium">Základ</th>
                      <th className="py-2 text-right font-medium">Daň</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b2.map((e) => (
                      <tr key={e.id} className="border-b border-stone-100">
                        <td className="py-1.5">{dicOf(e)}</td>
                        <td className="py-1.5">{e.docNumber ?? "—"}</td>
                        <td className="py-1.5">{formatDate(e.taxDate ?? e.date)}</td>
                        <td className="py-1.5">
                          <Link href={`/projects/${e.project.id}?tab=vydaje`} className="text-stone-900 underline-offset-2 hover:underline">
                            {e.title}
                          </Link>
                          <span className="text-stone-400"> · {e.vendor?.name ?? "—"}</span>
                        </td>
                        <td className="py-1.5 text-right font-mono">{formatCurrency(Number(e.vatBase ?? 0))}</td>
                        <td className="py-1.5 text-right font-mono">{formatCurrency(Number(e.vatAmount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-8">
            <h2 className="kicker mb-1">Kontrolní hlášení · oddíl B.3 (souhrnně)</h2>
            <p className="text-sm text-stone-700">
              {b3.length} dokladů · základ <span className="font-mono">{formatCurrency(b3Sum.base)}</span> · daň{" "}
              <span className="font-mono">{formatCurrency(b3Sum.vat)}</span>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
