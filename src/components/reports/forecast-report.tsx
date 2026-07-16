"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatCurrency } from "@/lib/utils";

// Recharts je těžká knihovna – načíst až na klientu (mimo initial bundle/SSR).
const ForecastChart = dynamic(
  () => import("@/components/reports/charts").then((m) => m.ForecastChart),
  {
    ssr: false,
    loading: () => <div className="h-64 w-full animate-pulse bg-stone-100" />,
  },
);

type Row = { date: string; amount: number };
type Interval = "month" | "quarter" | "year";

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "month", label: "Měsíc" },
  { value: "quarter", label: "Čtvrtletí" },
  { value: "year", label: "Rok" },
];

function periodMeta(d: Date, interval: Interval) {
  const y = d.getFullYear();
  if (interval === "year") return { key: `${y}`, label: `${y}`, sort: y * 100 };
  if (interval === "quarter") {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, sort: y * 100 + q };
  }
  const label =
    new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(d) +
    " " +
    String(y).slice(2);
  return { key: `${y}-${d.getMonth()}`, label, sort: y * 100 + d.getMonth() };
}

function startOfPeriod(d: Date, interval: Interval): Date {
  if (interval === "year") return new Date(d.getFullYear(), 0, 1);
  if (interval === "quarter")
    return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function nextPeriod(d: Date, interval: Interval): Date {
  if (interval === "year") return new Date(d.getFullYear() + 1, 0, 1);
  if (interval === "quarter") return new Date(d.getFullYear(), d.getMonth() + 3, 1);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

type Bucket = { key: string; label: string; sort: number; actual: number; forecast: number };

function bucketize(actual: Row[], forecast: Row[], interval: Interval): Bucket[] {
  const dates = [...actual, ...forecast]
    .map((r) => new Date(r.date))
    .filter((d) => !isNaN(d.getTime()));
  if (!dates.length) return [];
  const min = startOfPeriod(new Date(Math.min(...dates.map((d) => d.getTime()))), interval);
  const max = startOfPeriod(new Date(Math.max(...dates.map((d) => d.getTime()))), interval);

  const buckets = new Map<string, Bucket>();
  for (let c = min; c <= max; c = nextPeriod(c, interval)) {
    const p = periodMeta(c, interval);
    buckets.set(p.key, { ...p, actual: 0, forecast: 0 });
  }
  for (const r of actual) {
    const d = new Date(r.date);
    if (isNaN(d.getTime())) continue;
    buckets.get(periodMeta(d, interval).key)!.actual += r.amount;
  }
  for (const r of forecast) {
    const d = new Date(r.date);
    if (isNaN(d.getTime())) continue;
    buckets.get(periodMeta(d, interval).key)!.forecast += r.amount;
  }
  return [...buckets.values()].sort((a, b) => a.sort - b.sort);
}

export function ForecastReport({
  actual,
  forecast,
  undatedForecast = 0,
}: {
  actual: Row[];
  forecast: Row[];
  undatedForecast?: number;
}) {
  const [interval, setIntervalState] = useState<Interval>("month");
  const buckets = useMemo(
    () => bucketize(actual, forecast, interval),
    [actual, forecast, interval],
  );

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="inline-flex border border-stone-300">
          {INTERVALS.map((it) => (
            <button
              key={it.value}
              type="button"
              onClick={() => setIntervalState(it.value)}
              className={`px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                interval === it.value
                  ? "bg-stone-950 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>

      <ForecastChart data={buckets} />

      {undatedForecast > 0 && (
        <p className="text-xs text-stone-400">
          Forecast bez požadovaného data (nezahrnut v grafu):{" "}
          <span className="font-mono text-stone-600">{formatCurrency(undatedForecast)}</span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left text-stone-500">
              <th className="py-2 pr-4 font-normal kicker">Období</th>
              <th className="py-2 pr-4 text-right font-normal kicker">Skutečné</th>
              <th className="py-2 pr-4 text-right font-normal kicker">Forecast</th>
              <th className="py-2 text-right font-normal kicker">Celkem</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key} className="border-b border-stone-100">
                <td className="py-2 pr-4 text-stone-700">{b.label}</td>
                <td className="py-2 pr-4 text-right font-mono text-stone-950">
                  {b.actual ? formatCurrency(b.actual) : "—"}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-stone-500">
                  {b.forecast ? formatCurrency(b.forecast) : "—"}
                </td>
                <td className="py-2 text-right font-mono text-stone-950">
                  {formatCurrency(b.actual + b.forecast)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
