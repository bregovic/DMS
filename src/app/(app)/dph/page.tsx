import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { FinanceNav } from "@/components/invoices/finance-nav";
import { PeriodPicker } from "@/components/invoices/period-picker";
import { buildDp3 } from "@/server/dp3-xml";
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

  // vystavené doklady (uskutečněná plnění)
  const incomes = await prisma.income.findMany({
    where: {
      project: { ownerId: user.id },
      ...(projectId ? { projectId } : {}),
      taxable: true,
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
      customerName: true,
      customerDic: true,
      project: { select: { id: true, name: true } },
    },
  });
  const issued = incomes.filter((i) => i.vatAmount != null || i.vatBase != null);
  const outRate = new Map<number, { base: number; vat: number; count: number }>();
  for (const i of issued) {
    const rws = (i.vatBreakdown as { rate: number; base: number; vat: number }[] | null) ?? [];
    const list = rws.length ? rws : [{ rate: 0, base: Number(i.vatBase ?? 0), vat: Number(i.vatAmount ?? 0) }];
    for (const r of list) {
      const g = outRate.get(r.rate) ?? { base: 0, vat: 0, count: 0 };
      g.base += Number(r.base);
      g.vat += Number(r.vat);
      g.count += 1;
      outRate.set(r.rate, g);
    }
  }

  const a4 = issued.filter((i) => Number(i.amount) >= KH_LIMIT && i.customerDic);
  const a5 = issued.filter((i) => !(Number(i.amount) >= KH_LIMIT && i.customerDic));
  const a5Sum = a5.reduce(
    (a, i) => ({ base: a.base + Number(i.vatBase ?? 0), vat: a.vat + Number(i.vatAmount ?? 0) }),
    { base: 0, vat: 0 },
  );

  // řádky přiznání k DPH (měsíc / čtvrtletí)
  const dp3 =
    period === "rok"
      ? null
      : (
          await buildDp3(
            user.id,
            period.startsWith("q") ? { year, quarter: Number(period.slice(1)) } : { year, month: Number(period.replace("m", "")) },
            projectId || null,
          )
        ).summary;

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

  const years = [now.getUTCFullYear() + 1, now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2, year].filter((y, i, a) => a.indexOf(y) === i).sort((a, b) => b - a);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Doklady a fakturace</h1>
      </header>
      <FinanceNav />
      <div className="mb-6 mt-6 flex flex-wrap items-end justify-between gap-3">
        <p className="kicker">DPH · přijatá plnění podle DUZP · {periodLabel}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/api/export/dph?year=${year}&period=${period}${projectId ? `&project=${projectId}` : ""}`}
            className="flex h-9 items-center border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
          >
            CSV podkladu
          </Link>
          {period !== "rok" && (
            <Link
              href={`/api/export/dp3?year=${year}&period=${period}${projectId ? `&project=${projectId}` : ""}`}
              className="flex h-9 items-center border border-stone-950 bg-stone-950 px-3 text-sm text-white transition-colors hover:bg-stone-800"
            >
              XML přiznání k DPH
            </Link>
          )}
          {period !== "rok" && (
            <Link
              href={`/api/export/kh?year=${year}&period=${period}${projectId ? `&project=${projectId}` : ""}`}
              className="flex h-9 items-center border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
            >
              XML kontrolního hlášení
            </Link>
          )}
        </div>
      </div>

      <div className="mb-6">
        <PeriodPicker period={period} year={year} projectId={projectId} projects={projects} years={years} />
      </div>

      {taxed.length === 0 && issued.length === 0 ? (
        <EmptyState
          title="Za období nejsou doklady s DPH"
          description="Nahraj účtenky a faktury v projektu (Výdaje → Doklady). Systém z nich přečte základ, daň a DUZP a objeví se tady."
        />
      ) : (
        <>
          {issued.length > 0 && (
            <section className="mb-8">
              <h2 className="kicker mb-2">Souhrn – uskutečněná plnění (vystavené doklady)</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-stone-500">
                    <th className="py-2 font-medium">Sazba</th>
                    <th className="py-2 text-right font-medium">Základ</th>
                    <th className="py-2 text-right font-medium">Daň na výstupu</th>
                    <th className="py-2 text-right font-medium">Dokladů</th>
                  </tr>
                </thead>
                <tbody>
                  {[...outRate.entries()]
                    .sort((a, b) => b[0] - a[0])
                    .map(([rate, r]) => (
                      <tr key={rate} className="border-b border-stone-100">
                        <td className="py-2">{rate} %</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(r.base)}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(r.vat)}</td>
                        <td className="py-2 text-right text-stone-500">{r.count}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-stone-400">
                Vystavené doklady se poznají podle IČO a DIČ v Nastavení → Fakturace a daně; v přiznání jsou to řádky 1 a 2.
              </p>
            </section>
          )}

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

          {dp3 && (
            <section className="mb-8 border border-stone-300 bg-stone-50 p-3">
              <h2 className="kicker mb-2">Přiznání k DPH – řádky</h2>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    { r: "1", l: "Dodání zboží a služeb, základní sazba 21 %", base: dp3.out21.base, vat: dp3.out21.vat },
                    { r: "2", l: "Dodání zboží a služeb, snížená sazba 12 %", base: dp3.out12.base, vat: dp3.out12.vat },
                    { r: "40", l: "Přijatá plnění, základní sazba – nárok na odpočet", base: dp3.in21.base, vat: dp3.in21.vat },
                    { r: "41", l: "Přijatá plnění, snížená sazba – nárok na odpočet", base: dp3.in12.base, vat: dp3.in12.vat },
                  ].map((x) => (
                    <tr key={x.r} className="border-b border-stone-200">
                      <td className="w-10 py-1.5 text-stone-400">{x.r}</td>
                      <td className="py-1.5 text-stone-700">{x.l}</td>
                      <td className="py-1.5 text-right font-mono text-stone-600">{formatCurrency(x.base)}</td>
                      <td className="w-28 py-1.5 text-right font-mono text-stone-950">{formatCurrency(x.vat)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-stone-200">
                    <td className="py-1.5 text-stone-400">62</td>
                    <td className="py-1.5 text-stone-700" colSpan={2}>
                      Daň na výstupu
                    </td>
                    <td className="py-1.5 text-right font-mono text-stone-950">{formatCurrency(dp3.taxOut)}</td>
                  </tr>
                  <tr className="border-b border-stone-200">
                    <td className="py-1.5 text-stone-400">63</td>
                    <td className="py-1.5 text-stone-700" colSpan={2}>
                      Odpočet daně
                    </td>
                    <td className="py-1.5 text-right font-mono text-stone-950">{formatCurrency(dp3.deduction)}</td>
                  </tr>
                  <tr className="font-medium">
                    <td className="py-2 text-stone-400">{dp3.result >= 0 ? "64" : "66"}</td>
                    <td className="py-2 text-stone-900" colSpan={2}>
                      {dp3.result >= 0 ? "Vlastní daň (k zaplacení)" : "Nadměrný odpočet (vrátí se)"}
                    </td>
                    <td className={`py-2 text-right font-mono ${dp3.result >= 0 ? "text-stone-950" : "text-emerald-700"}`}>
                      {formatCurrency(Math.abs(dp3.result))}
                    </td>
                  </tr>
                </tbody>
              </table>
              {dp3.missing.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-amber-800">
                  {dp3.missing.map((m) => (
                    <li key={m}>⚠ {m}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-stone-400">
                Spočítáno z dokladů v evidenci. Nezahrnuje zálohy, opravy, přenesenou daňovou povinnost, dovoz, vývoz ani
                osvobozená plnění – ty na portálu doplň ručně. Jde o podklad, ne o podání.
              </p>
            </section>
          )}

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

          {a4.length > 0 && (
            <section className="mb-8">
              <h2 className="kicker mb-1">Kontrolní hlášení · oddíl A.4 (vystavené doklady od {formatCurrency(KH_LIMIT)})</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="border-b border-stone-300 text-left text-stone-500">
                      <th className="py-2 font-medium">DIČ odběratele</th>
                      <th className="py-2 font-medium">Číslo dokladu</th>
                      <th className="py-2 font-medium">DUZP</th>
                      <th className="py-2 font-medium">Doklad</th>
                      <th className="py-2 text-right font-medium">Základ</th>
                      <th className="py-2 text-right font-medium">Daň</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a4.map((i) => (
                      <tr key={i.id} className="border-b border-stone-100">
                        <td className="py-1.5">{i.customerDic}</td>
                        <td className="py-1.5">{i.docNumber ?? "—"}</td>
                        <td className="py-1.5">{formatDate(i.taxDate ?? i.date)}</td>
                        <td className="py-1.5">
                          {i.title}
                          <span className="text-stone-400"> · {i.customerName ?? "—"}</span>
                        </td>
                        <td className="py-1.5 text-right font-mono">{formatCurrency(Number(i.vatBase ?? 0))}</td>
                        <td className="py-1.5 text-right font-mono">{formatCurrency(Number(i.vatAmount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {a5.length > 0 && (
            <section className="mb-8">
              <h2 className="kicker mb-1">Kontrolní hlášení · oddíl A.5 (souhrnně)</h2>
              <p className="text-sm text-stone-700">
                {a5.length} dokladů · základ <span className="font-mono">{formatCurrency(a5Sum.base)}</span> · daň{" "}
                <span className="font-mono">{formatCurrency(a5Sum.vat)}</span>
              </p>
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

          <p className="mb-10 text-[11px] text-stone-400">
            XML se načítá na portálu MOJE daně (Elektronická podání → Načíst soubor), kde projde kontrolou. Identifikační
            údaje (DIČ, adresa, finanční úřad) se berou z Nastavení → Fakturace a daně. Jde o podklad, ne o podání –
            čísla i zařazení dokladů si před odesláním zkontroluj.
          </p>
        </>
      )}
    </div>
  );
}
