import type { ReportData, ReportKind, ReportResult } from "@/server/cost-report";

/**
 * Report nákladů (#48) – A4 strany pro obrazovku, tisk i uložení do PDF.
 * Všechny součty se počítají tady z rozřazení; model dodává jen přiřazení
 * a texty. Grafy jsou čisté SVG (tisk i převod do PDF bez knihoven).
 */

const INK = "#0b0b0b";
const INK2 = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const BASE = "#c3c2b7";

export const KIND_LABEL: Record<ReportKind, string> = {
  prace: "Práce",
  material: "Materiál",
  stroje: "Stroje, pronájem a doprava",
  projekt: "Projekt a poplatky",
  rezie: "Palivo a režie",
};
const KINDS: ReportKind[] = ["prace", "material", "stroje", "projekt", "rezie"];
// Kategorická paleta v pevném pořadí (ověřená na rozlišitelnost i pro barvoslepé).
const KIND_COLOR: Record<ReportKind, string> = {
  prace: "#2a78d6",
  material: "#eb6834",
  stroje: "#1baf7a",
  projekt: "#eda100",
  rezie: "#e87ba4",
};

const nf0 = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const kc = (v: number) => `${nf0.format(Math.round(v))} Kč`;
const tis = (v: number) => `${nf0.format(Math.round(v / 1000))} tis.`;
const mil = (v: number, d = 2) => `${(v / 1e6).toFixed(d).replace(".", ",")} mil. Kč`;
const m1 = (v: number) => (v / 1e6).toFixed(1).replace(".", ",");
const MONTHS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
const dateCz = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};

/** Bez výsledku z modelu: celek = fáze úkolu, druh podle kategorie. */
function fallbackAssign(data: ReportData): ReportResult["assign"] {
  return data.expenses.map((e) => {
    const c = e.category.toLowerCase();
    const kind: ReportKind = /pr[aá]ce|mzd|brig/.test(c) || e.hours
      ? "prace"
      : /doprav|pron[aá]j|stroj|kontejn|leš/.test(c)
        ? "stroje"
        : /projekt|poplat|služ|sluz/.test(c)
          ? "projekt"
          : /palivo|fuel|nářad|narad/.test(c)
            ? "rezie"
            : "material";
    return { key: e.key, group: e.phase ?? e.task ?? "Bez zařazení", kind, activity: null };
  });
}

type Computed = ReturnType<typeof compute>;

function compute(data: ReportData, result: ReportResult | null) {
  const assign = result?.assign ?? fallbackAssign(data);
  const byKey = new Map(assign.map((a) => [a.key, a]));
  const total = data.expenses.reduce((s, e) => s + e.amount, 0);
  const unpaid = data.expenses.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);

  const byKind = new Map<ReportKind, number>();
  const byGroup = new Map<string, Map<ReportKind, number>>();
  const byMonth = new Map<string, number>();
  const byVendor = new Map<string, number>();
  const act = new Map<string, { vendor: string; activity: string; actual: number }>();
  for (const e of data.expenses) {
    const a = byKey.get(e.key)!;
    byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + e.amount);
    const g = byGroup.get(a.group) ?? new Map<ReportKind, number>();
    g.set(a.kind, (g.get(a.kind) ?? 0) + e.amount);
    byGroup.set(a.group, g);
    byMonth.set(e.date.slice(0, 7), (byMonth.get(e.date.slice(0, 7)) ?? 0) + e.amount);
    const v = e.vendor ?? "(bez dodavatele)";
    byVendor.set(v, (byVendor.get(v) ?? 0) + e.amount);
    if (a.kind === "prace" && a.activity) {
      const k = `${v}|${a.activity}`;
      const x = act.get(k) ?? { vendor: v, activity: a.activity, actual: 0 };
      x.actual += e.amount;
      act.set(k, x);
    }
  }
  const groupSum = (g: Map<ReportKind, number>) => [...g.values()].reduce((s, x) => s + x, 0);
  const order = result?.groups ?? [];
  const groups = [...byGroup.entries()]
    .map(([name, vals]) => ({ name, vals, sum: groupSum(vals) }))
    .sort((a, b) => b.sum - a.sum);

  // měsíce bez mezer
  const mKeys = [...byMonth.keys()].sort();
  const months: { label: string; value: number }[] = [];
  if (mKeys.length) {
    const [y0, mo0] = mKeys[0].split("-").map(Number);
    const [y1, mo1] = mKeys[mKeys.length - 1].split("-").map(Number);
    for (let y = y0, m = mo0; y < y1 || (y === y1 && m <= mo1); m === 12 ? ((m = 1), y++) : m++) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      months.push({ label: MONTHS[m - 1] + (y0 !== y1 && m === 1 ? ` ${String(y).slice(2)}` : ""), value: byMonth.get(k) ?? 0 });
    }
  }
  let acc = 0;
  const cumulative = months.map((m) => ({ label: m.label, value: (acc += m.value) }));
  const vendors = [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // zbývající náklady po celcích
  const fAssign = new Map((result?.forecastAssign ?? []).map((a) => [a.key, a.group]));
  const fcPlan = new Map<string, number>();
  for (const f of data.forecast) {
    const g = fAssign.get(f.key) ?? f.phase ?? "Ostatní";
    fcPlan.set(g, (fcPlan.get(g) ?? 0) + f.amount);
  }
  const bands = new Map((result?.forecastBands ?? []).map((b) => [b.group, b]));
  const fcNames = [...new Set([...fcPlan.keys(), ...bands.keys()])];
  const fcRows = fcNames
    .map((name) => {
      const plan = fcPlan.get(name) ?? 0;
      const b = bands.get(name);
      return { name, plan, low: b?.low ?? plan, high: b?.high ?? plan, note: b?.note ?? "" };
    })
    .filter((r) => r.plan > 0 || r.high > 0)
    .sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.high - a.high;
    });
  const fcPlanTotal = data.forecast.reduce((s, f) => s + f.amount, 0);
  const fcLow = fcRows.reduce((s, r) => s + r.low, 0);
  const fcHigh = fcRows.reduce((s, r) => s + r.high, 0);

  const plans = new Map((result?.activities ?? []).map((a) => [`${a.vendor}|${a.activity}`, a]));
  const activities = [...act.values()]
    .map((a) => {
      const p = plans.get(`${a.vendor}|${a.activity}`);
      return { ...a, plan: p?.plan ?? null, note: p?.note ?? null };
    })
    .sort((a, b) => a.vendor.localeCompare(b.vendor, "cs") || b.actual - a.actual);

  const done = data.phases.reduce((s, p) => s + p.done, 0);
  const all = data.phases.reduce((s, p) => s + p.total, 0);
  const recent = months.slice(-4, -1);
  const pace = recent.length ? recent.reduce((s, m) => s + m.value, 0) / recent.length : 0;

  return { total, unpaid, byKind, groups, months, cumulative, vendors, fcRows, fcPlanTotal, fcLow, fcHigh, activities, done, all, pace };
}

// ---------------------------------------------------------------------------
// Grafy
// ---------------------------------------------------------------------------

function niceStep(max: number) {
  const raw = max / 5;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? p * 10;
}

function StackedBars({ rows }: { rows: Computed["groups"] }) {
  const width = 700, rowH = 28, labelW = 210, valueW = 70;
  const max = Math.max(1, ...rows.map((r) => r.sum));
  const plot = width - labelW - valueW;
  const h = rows.length * rowH + 22;
  const step = niceStep(max);
  const ticks: number[] = [];
  for (let g = 0; g <= max; g += step) ticks.push(g);
  return (
    <svg viewBox={`0 0 ${width} ${h}`} width="100%" role="img" aria-label="Náklady podle celků">
      {ticks.map((g) => {
        const x = labelW + (g / max) * plot;
        return (
          <g key={g}>
            <line x1={x} y1={0} x2={x} y2={h - 18} stroke={GRID} />
            <text x={x} y={h - 5} fontSize={10} fill={MUTED} textAnchor="middle">{nf0.format(g / 1000)}</text>
          </g>
        );
      })}
      <text x={width} y={h - 5} fontSize={10} fill={MUTED} textAnchor="end">tis. Kč</text>
      {rows.map((r, i) => {
        const y = i * rowH + 5;
        const bh = rowH - 11;
        let x = labelW;
        const segs = KINDS.filter((k) => (r.vals.get(k) ?? 0) > 0);
        return (
          <g key={r.name}>
            <text x={labelW - 10} y={y + bh / 2 + 4} fontSize={11.5} fill={INK} textAnchor="end">{clip(r.name, 34)}</text>
            {segs.map((k, j) => {
              const w = ((r.vals.get(k) ?? 0) / max) * plot;
              const last = j === segs.length - 1;
              const ww = Math.max(w - (last ? 0 : 2), 0.5);
              const x0 = x;
              x += w;
              if (!last) return <rect key={k} x={x0} y={y} width={ww} height={bh} fill={KIND_COLOR[k]} />;
              const rr = Math.min(4, ww / 2);
              return (
                <path
                  key={k}
                  d={`M${x0},${y} h${ww - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${bh - 2 * rr} a${rr},${rr} 0 0 1 -${rr},${rr} h-${ww - rr} z`}
                  fill={KIND_COLOR[k]}
                />
              );
            })}
            <text x={x + 8} y={y + bh / 2 + 4} fontSize={11.5} fill={INK2} fontWeight={600}>{tis(r.sum)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Columns({ items }: { items: { label: string; value: number }[] }) {
  const width = 700, h = 190, top = 20, bottom = 24;
  const plotH = h - top - bottom;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (width - 20) / Math.max(1, items.length);
  return (
    <svg viewBox={`0 0 ${width} ${h}`} width="100%" role="img" aria-label="Čerpání po měsících">
      <line x1={10} y1={top + plotH} x2={width} y2={top + plotH} stroke={BASE} />
      {items.map((it, i) => {
        const bh = (it.value / max) * plotH;
        const w = Math.min(60, bw * 0.64);
        const x = 20 + i * bw + (bw - w) / 2;
        const y = top + plotH - bh;
        const r = Math.min(4, w / 2, bh);
        return (
          <g key={i}>
            {bh > 0 && (
              <path
                d={`M${x},${top + plotH} v-${bh - r} a${r},${r} 0 0 1 ${r},-${r} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${bh - r} z`}
                fill="#2a78d6"
              />
            )}
            {it.value > 0 && <text x={x + w / 2} y={y - 5} fontSize={10} fill={INK2} textAnchor="middle">{tis(it.value)}</text>}
            <text x={x + w / 2} y={h - 6} fontSize={10.5} fill={MUTED} textAnchor="middle">{it.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Line({ items }: { items: { label: string; value: number }[] }) {
  const width = 700, h = 150, top = 14, bottom = 24, left = 44;
  const plotH = h - top - bottom;
  const plotW = width - left - 20;
  const max = Math.max(1, ...items.map((i) => i.value)) * 1.08;
  const n = items.length;
  const pts = items.map((it, i) => [left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2), top + plotH - (it.value / max) * plotH] as const);
  const step = niceStep(max);
  const ticks: number[] = [];
  for (let g = step; g < max; g += step) ticks.push(g);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${h}`} width="100%" role="img" aria-label="Kumulované čerpání">
      {ticks.map((g) => {
        const y = top + plotH - (g / max) * plotH;
        return (
          <g key={g}>
            <line x1={left} y1={y} x2={width - 20} y2={y} stroke={GRID} />
            <text x={left - 6} y={y + 3} fontSize={10} fill={MUTED} textAnchor="end">{g >= 1e6 ? `${(g / 1e6).toFixed(1).replace(".", ",")} M` : `${nf0.format(g / 1000)} t`}</text>
          </g>
        );
      })}
      <line x1={left} y1={top + plotH} x2={width - 20} y2={top + plotH} stroke={BASE} />
      <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#2a78d6" strokeWidth={2} />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={4} fill="#2a78d6" stroke="#fff" strokeWidth={2} />
          <text x={x} y={h - 6} fontSize={10.5} fill={MUTED} textAnchor="middle">{items[i].label}</text>
        </g>
      ))}
      {last && (
        <text x={last[0] - 10} y={last[1] + 4} fontSize={11} fill={INK} fontWeight={600} textAnchor="end">{mil(items[items.length - 1].value)}</text>
      )}
    </svg>
  );
}

function Ranges({ rows }: { rows: Computed["fcRows"] }) {
  const width = 700, rowH = 26, labelW = 220;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.high, r.plan)));
  const plot = width - labelW - 95;
  const h = rows.length * rowH + 22;
  const step = niceStep(max);
  const ticks: number[] = [];
  for (let g = 0; g <= max; g += step) ticks.push(g);
  return (
    <svg viewBox={`0 0 ${width} ${h}`} width="100%" role="img" aria-label="Zbývající náklady">
      {ticks.map((g) => {
        const x = labelW + (g / max) * plot;
        return (
          <g key={g}>
            <line x1={x} y1={0} x2={x} y2={h - 18} stroke={GRID} />
            <text x={x} y={h - 5} fontSize={10} fill={MUTED} textAnchor="middle">{nf0.format(g / 1000)}</text>
          </g>
        );
      })}
      <text x={width} y={h - 5} fontSize={10} fill={MUTED} textAnchor="end">tis. Kč</text>
      {rows.map((r, i) => {
        const y = i * rowH + 5;
        const bh = rowH - 10;
        const x1 = labelW + (r.low / max) * plot;
        const x2 = labelW + (r.high / max) * plot;
        const xd = labelW + (r.plan / max) * plot;
        return (
          <g key={r.name}>
            <text x={labelW - 10} y={y + bh / 2 + 4} fontSize={11.5} fill={INK} textAnchor="end">{clip(r.name, 34)}</text>
            <rect x={x1} y={y + 2} width={Math.max(x2 - x1, 4)} height={bh - 4} rx={4} fill="#eb6834" />
            <line x1={xd} y1={y - 2} x2={xd} y2={y + bh + 2} stroke={INK} strokeWidth={2.5} />
            <text x={Math.max(x2, xd) + 8} y={y + bh / 2 + 4} fontSize={10.5} fill={INK2}>
              {r.low === r.high ? tis(r.low) : `${nf0.format(r.low / 1000)}–${tis(r.high)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const VERDICT: Record<string, { cls: string; label: string }> = {
  good: { cls: "good", label: "✓ pod trhem" },
  ok: { cls: "ok", label: "≈ na úrovni trhu" },
  check: { cls: "warn", label: "! ověřit" },
  bad: { cls: "bad", label: "▲ nad trhem" },
};
function actVerdict(actual: number, plan: number | null) {
  if (plan == null || plan <= 0) return { cls: "ok", label: "bez plánu" };
  const r = actual / plan;
  if (r <= 1.1) return { cls: "good", label: "✓ v plánu" };
  if (r <= 1.5) return { cls: "warn", label: `! +${Math.round((r - 1) * 100)} %` };
  return { cls: "bad", label: `▲ ${r.toFixed(1).replace(".", ",")}× plán` };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function CostReportView({ data, result, error }: { data: ReportData; result: ReportResult | null; error?: string | null }) {
  const c = compute(data, result);
  const scope = data.scopeName === data.projectName ? data.projectName : `${data.projectName} · ${data.scopeName}`;
  const finalLo = c.total + c.fcLow;
  const finalHi = c.total + c.fcHigh;
  const hasBands = (result?.forecastBands.length ?? 0) > 0;

  return (
    <div className="rp">
      <style>{CSS}</style>

      <section className="rp-page">
        <div className="rp-cover">
          <div className="rp-kicker">{scope}</div>
          <h1>Report nákladů</h1>
          <div className="rp-sub">
            Stav k {dateCz(data.generatedAt)} · {data.expenses.length} výdajů
            {data.expenses.length ? ` od ${dateCz(data.expenses[0].date)}` : ""}
          </div>
        </div>
        {error && <p className="rp-error">Rozřazení a komentář se nepodařilo připravit ({error}). Celky jsou podle fází úkolů.</p>}
        <div className="rp-kpis">
          <Kpi label="Utraceno" value={mil(c.total)} note={c.unpaid > 0 ? `z toho ${kc(c.unpaid)} k úhradě` : "vše uhrazeno"} />
          <Kpi label="Zbývá podle plánu" value={mil(c.fcPlanTotal)} note={hasBands ? `realisticky ${m1(c.fcLow)}–${m1(c.fcHigh)} mil. Kč` : "odhady úkolů a žádanky"} />
          <Kpi
            label="Odhad celkem"
            value={hasBands ? `${m1(finalLo)}–${m1(finalHi)} mil.` : mil(c.total + c.fcPlanTotal)}
            note={data.budget ? `rozpočet ${mil(data.budget)}` : `podle plánu ${mil(c.total + c.fcPlanTotal)}`}
          />
          <Kpi label="Hotovo úkolů" value={`${c.done} / ${c.all}`} note={c.pace > 0 ? `tempo ~${tis(c.pace)} Kč/měs.` : ""} />
        </div>
        {result && result.summary.length > 0 && (
          <>
            <h2>Shrnutí</h2>
            <div className="rp-cards">
              {result.summary.map((s, i) => (
                <div key={i} className={`rp-card ${s.tone === "good" ? "good" : s.tone === "warn" ? "warn" : ""}`}>
                  <b>{s.title}</b>
                  {s.text}
                </div>
              ))}
            </div>
          </>
        )}
        <h3>Rozdělení podle druhu nákladů</h3>
        <div className="rp-share">
          {KINDS.filter((k) => (c.byKind.get(k) ?? 0) > 0).map((k) => (
            <div key={k} style={{ flex: c.byKind.get(k), background: KIND_COLOR[k] }} />
          ))}
        </div>
        <div className="rp-sharelab">
          {KINDS.filter((k) => (c.byKind.get(k) ?? 0) > 0).map((k) => (
            <div key={k}>
              <i style={{ background: KIND_COLOR[k] }} />
              <b>{Math.round(((c.byKind.get(k) ?? 0) / Math.max(1, c.total)) * 100)} %</b> {KIND_LABEL[k]}
              <br />
              <span>{kc(c.byKind.get(k) ?? 0)}</span>
            </div>
          ))}
        </div>
        {result?.assumptions && <div className="rp-foot">{result.assumptions}</div>}
      </section>

      <section className="rp-page">
        <div className="rp-kicker">Kam šly peníze</div>
        <h2>Náklady podle celků</h2>
        <Legend />
        <StackedBars rows={c.groups} />
        <h3>Rozpis</h3>
        <table className="rp-num">
          <thead>
            <tr>
              <th>Celek</th>
              <th>Práce</th>
              <th>Materiál</th>
              <th>Stroje a doprava</th>
              <th>Ostatní</th>
              <th>Celkem</th>
              <th>Podíl</th>
            </tr>
          </thead>
          <tbody>
            {c.groups.map((g) => {
              const v = (k: ReportKind) => g.vals.get(k) ?? 0;
              const ost = v("projekt") + v("rezie");
              return (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  {[v("prace"), v("material"), v("stroje"), ost].map((x, i) => (
                    <td key={i}>{x ? tis(x) : "–"}</td>
                  ))}
                  <td><b>{tis(g.sum)}</b></td>
                  <td>{Math.round((g.sum / Math.max(1, c.total)) * 100)} %</td>
                </tr>
              );
            })}
            <tr className="sum">
              <td>Celkem</td>
              <td>{tis(c.byKind.get("prace") ?? 0)}</td>
              <td>{tis(c.byKind.get("material") ?? 0)}</td>
              <td>{tis(c.byKind.get("stroje") ?? 0)}</td>
              <td>{tis((c.byKind.get("projekt") ?? 0) + (c.byKind.get("rezie") ?? 0))}</td>
              <td>{tis(c.total)}</td>
              <td>100 %</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rp-page">
        <div className="rp-kicker">Průběh v čase</div>
        <h2>Čerpání po měsících</h2>
        <Columns items={c.months} />
        <h3>Kumulovaně</h3>
        <Line items={c.cumulative} />
        <h3>Největší dodavatelé</h3>
        <table className="rp-num">
          <thead>
            <tr>
              <th>Dodavatel</th>
              <th>Celkem</th>
              <th>Podíl</th>
            </tr>
          </thead>
          <tbody>
            {c.vendors.map(([v, a]) => (
              <tr key={v}>
                <td>{v}</td>
                <td>{tis(a)}</td>
                <td>{Math.round((a / Math.max(1, c.total)) * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {result && result.comparisons.length > 0 && (
        <section className="rp-page">
          <div className="rp-kicker">Ceny proti trhu</div>
          <h2>Jak si vedeme v cenách</h2>
          <table className="rp-cmp">
            <thead>
              <tr>
                <th style={{ width: "32%" }}>Položka</th>
                <th>U nás</th>
                <th>Trh</th>
                <th>Hodnocení</th>
              </tr>
            </thead>
            <tbody>
              {result.comparisons.map((x, i) => (
                <tr key={i}>
                  <td>
                    <b>{x.item}</b>
                    {x.note && (
                      <>
                        <br />
                        <small>{x.note}</small>
                      </>
                    )}
                  </td>
                  <td>{x.ours}</td>
                  <td>{x.market}</td>
                  <td>
                    <span className={`rp-badge ${VERDICT[x.verdict]?.cls ?? "ok"}`}>{VERDICT[x.verdict]?.label ?? x.verdict}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rp-foot">Ceny trhu jsou orientační – ceník z katalogu a obvyklé ceny v ČR. Výpočty jednotkových cen vycházejí z množství uvedených ve výdajích, dokladech a upřesnění.</div>
        </section>
      )}

      {c.fcRows.length > 0 && (
        <section className="rp-page">
          <div className="rp-kicker">Výhled</div>
          <h2>Co zbývá zaplatit</h2>
          <div className="rp-legend">
            <span><i style={{ background: INK, width: 3 }} />plán (odhady úkolů a žádanky)</span>
            {hasBands && <span><i style={{ background: "#eb6834" }} />realistické pásmo podle cen trhu</span>}
          </div>
          <Ranges rows={c.fcRows} />
          <table className="rp-num">
            <thead>
              <tr>
                <th>Celek</th>
                <th>Plán</th>
                {hasBands && <th>Realisticky</th>}
                <th style={{ textAlign: "left" }}>Co v tom je</th>
              </tr>
            </thead>
            <tbody>
              {c.fcRows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.plan ? tis(r.plan) : <span className="rp-warnt">bez ceny</span>}</td>
                  {hasBands && <td>{r.low === r.high ? tis(r.low) : `${nf0.format(r.low / 1000)}–${tis(r.high)}`}</td>}
                  <td className="note">{r.note}</td>
                </tr>
              ))}
              <tr className="sum">
                <td>Celkem zbývá</td>
                <td>{tis(c.fcPlanTotal)}</td>
                {hasBands && <td>{`${nf0.format(c.fcLow / 1000)}–${tis(c.fcHigh)}`}</td>}
                <td />
              </tr>
            </tbody>
          </table>
          <div className="rp-kpis" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <Kpi label="Celkem podle plánu" value={mil(c.total + c.fcPlanTotal)} />
            {hasBands && <Kpi label="Celkem realisticky" value={`${m1(finalLo)}–${m1(finalHi)} mil. Kč`} />}
            {hasBands && <Kpi label="S rezervou 10 %" value={`${m1(c.total + c.fcLow * 1.1)}–${m1(c.total + c.fcHigh * 1.1)} mil. Kč`} />}
          </div>
          {hasBands && <div className="rp-foot">Realistické pásmo není nabídka – je to orientační odhad podle obvyklých cen u položek, které v plánu cenu nemají nebo ji mají jen za práci.</div>}
        </section>
      )}

      <section className="rp-page">
        {c.activities.length > 0 && (
          <>
            <div className="rp-kicker">Práce dodavatelů</div>
            <h2>Skutečnost proti plánu</h2>
            <table className="rp-num">
              <thead>
                <tr>
                  <th>Dodavatel · činnost</th>
                  <th>Skutečnost</th>
                  <th>Plán</th>
                  <th>Hodnocení</th>
                  <th style={{ textAlign: "left" }}>Poznámka</th>
                </tr>
              </thead>
              <tbody>
                {c.activities.map((a) => {
                  const v = actVerdict(a.actual, a.plan);
                  return (
                    <tr key={`${a.vendor}|${a.activity}`}>
                      <td>
                        <small>{a.vendor}</small>
                        <br />
                        {a.activity}
                      </td>
                      <td>{tis(a.actual)}</td>
                      <td>{a.plan != null ? tis(a.plan) : "–"}</td>
                      <td><span className={`rp-badge ${v.cls}`}>{v.label}</span></td>
                      <td className="note">{a.note ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        {data.phases.length > 0 && (
          <>
            <div className="rp-kicker" style={{ marginTop: c.activities.length ? "6mm" : 0 }}>Harmonogram</div>
            <h2>Kde stavba je</h2>
            <div className="rp-two">
              {[data.phases.slice(0, Math.ceil(data.phases.length / 2)), data.phases.slice(Math.ceil(data.phases.length / 2))].map((col, ci) => (
                <table key={ci} className="rp-prog">
                  <tbody>
                    {col.map((p) => {
                      const r = p.done / p.total;
                      const col2 = r === 1 ? "#0ca30c" : p.done > 0 ? "#2a78d6" : BASE;
                      return (
                        <tr key={p.title}>
                          <td className="pn">{clip(p.title, 30)}</td>
                          <td>
                            <div className="bar"><div style={{ width: `${Math.round(r * 100)}%`, background: col2 }} /></div>
                          </td>
                          <td className="pv">{p.done}/{p.total}</td>
                          <td className="ps">{r === 1 ? "hotovo" : p.done > 0 ? "rozpracováno" : "čeká"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}
            </div>
          </>
        )}
        {result && result.recommendations.length > 0 && (
          <>
            <h3>Doporučení</h3>
            <ul className="rp-list">
              {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </>
        )}
        <div className="rp-foot">Podklady: výdaje, úkoly a žádanky v DMS k {dateCz(data.generatedAt)}. Rozřazení výdajů do celků a druhů je odvozené z popisu, dodavatele a data.</div>
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rp-kpi">
      <div className="rp-kicker">{label}</div>
      <div className="v">{value}</div>
      {note ? <div className="d">{note}</div> : null}
    </div>
  );
}

function Legend() {
  return (
    <div className="rp-legend">
      {KINDS.map((k) => (
        <span key={k}>
          <i style={{ background: KIND_COLOR[k] }} />
          {KIND_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

const CSS = `
.rp { color: ${INK}; font-family: var(--font-geist-sans), "Segoe UI", Arial, sans-serif; font-size: 10pt; line-height: 1.42; }
.rp-page { width: 210mm; min-height: 297mm; padding: 14mm; margin: 0 auto 8mm; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12); box-sizing: border-box; }
.rp h1 { font-size: 30pt; margin: 1mm 0 2mm; letter-spacing: -0.5px; font-weight: 700; line-height: 1.1; }
.rp h2 { font-size: 15pt; margin: 0 0 3mm; font-weight: 700; }
.rp h3 { font-size: 11pt; margin: 5mm 0 2mm; font-weight: 600; }
.rp-kicker { text-transform: uppercase; letter-spacing: 1.5px; font-size: 7.5pt; color: ${MUTED}; font-weight: 600; margin-bottom: 1mm; }
.rp-sub { color: ${INK2}; font-size: 11pt; }
.rp-cover { border-bottom: 3px solid ${INK}; padding-bottom: 5mm; margin-bottom: 5mm; }
.rp-error { background: #fdf0d2; color: #7a5200; padding: 2mm 3mm; font-size: 9pt; }
.rp-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 4mm 0 6mm; }
.rp-kpi { background: #f4f3ee; padding: 3.5mm 4mm; border-radius: 2mm; }
.rp-kpi .v { font-size: 15pt; font-weight: 700; margin-top: 0.5mm; white-space: nowrap; }
.rp-kpi .d { font-size: 8.5pt; color: ${INK2}; }
.rp-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.rp-card { border: 1px solid ${GRID}; border-radius: 2mm; padding: 3mm 4mm; font-size: 9.3pt; color: ${INK2}; }
.rp-card b { display: block; margin-bottom: 1mm; color: ${INK}; font-size: 10pt; }
.rp-card.good { border-left: 4px solid #0ca30c; } .rp-card.warn { border-left: 4px solid #fab219; }
.rp-legend { display: flex; flex-wrap: wrap; gap: 4mm; font-size: 9pt; color: ${INK2}; margin: 1mm 0 2mm; }
.rp-legend i, .rp-sharelab i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; }
.rp table { border-collapse: collapse; width: 100%; font-size: 9pt; }
.rp th { text-align: left; font-weight: 600; color: ${INK2}; border-bottom: 1.5px solid ${BASE}; padding: 1.5mm 2mm; font-size: 8.5pt; }
.rp td { border-bottom: 1px solid ${GRID}; padding: 1.5mm 2mm; vertical-align: top; }
.rp tr { break-inside: avoid; }
.rp-num td:not(:first-child), .rp-num th:not(:first-child) { text-align: right; white-space: nowrap; }
.rp-num td.note { text-align: left; white-space: normal; color: ${INK2}; font-size: 8.5pt; }
.rp tr.sum td { font-weight: 700; border-top: 1.5px solid ${BASE}; border-bottom: none; }
.rp small { color: ${MUTED}; font-size: 8pt; }
.rp-badge { display: inline-block; padding: 0.6mm 2.2mm; border-radius: 10px; font-size: 8.5pt; font-weight: 600; white-space: nowrap; }
.rp-badge.good { background: #e3f4e3; color: #006300; } .rp-badge.ok { background: #eceae4; color: ${INK2}; }
.rp-badge.warn { background: #fdf0d2; color: #7a5200; } .rp-badge.bad { background: #f8dede; color: #9d2222; }
.rp-warnt { color: #7a5200; font-weight: 600; }
.rp-share { display: flex; height: 16px; gap: 2px; border-radius: 4px; overflow: hidden; margin: 2mm 0 3mm; }
.rp-sharelab { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; font-size: 8.5pt; }
.rp-sharelab span { color: ${MUTED}; }
.rp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.rp-prog td { padding: 0.9mm 1.5mm; border: none; vertical-align: middle; font-size: 8.8pt; }
.rp-prog .pn { width: 40mm; } .rp-prog .pv { width: 11mm; text-align: right; color: ${INK2}; } .rp-prog .ps { width: 22mm; color: ${MUTED}; }
.rp-prog .bar { background: #eceae4; height: 8px; border-radius: 4px; overflow: hidden; } .rp-prog .bar div { height: 100%; border-radius: 4px; }
.rp-list { margin: 1mm 0; padding-left: 5mm; font-size: 9.3pt; } .rp-list li { margin-bottom: 1mm; }
.rp-foot { font-size: 8pt; color: ${MUTED}; margin-top: 4mm; border-top: 1px solid ${GRID}; padding-top: 2mm; }
@media print {
  @page { size: A4; margin: 0; }
  body { background: #fff !important; }
  .no-print { display: none !important; }
  .rp-page { margin: 0; box-shadow: none; break-after: page; }
  .rp-page:last-child { break-after: auto; }
  .rp { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
