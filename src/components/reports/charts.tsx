"use client";

import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const tooltipStyle = {
  border: "1px solid #0a0a0a",
  borderRadius: 0,
  fontSize: 12,
  background: "#ffffff",
} as const;

export function MonthlyBarChart({
  data,
}: {
  data: { label: string; total: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#78716c" }}
          axisLine={{ stroke: "#d6d3d1" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#78716c" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value)), "Výdaje"]}
          cursor={{ fill: "#ebe9e4" }}
          contentStyle={tooltipStyle}
        />
        <Bar dataKey="total" fill="#0a0a0a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ForecastChart({
  data,
}: {
  data: { label: string; actual: number; forecast: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#78716c" }}
          axisLine={{ stroke: "#d6d3d1" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#78716c" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value)),
            name === "forecast" ? "Forecast" : "Skutečné",
          ]}
          cursor={{ fill: "#ebe9e4" }}
          contentStyle={tooltipStyle}
        />
        <Legend
          formatter={(v) => (v === "forecast" ? "Forecast" : "Skutečné")}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="actual" stackId="a" fill="#0a0a0a" />
        <Bar dataKey="forecast" stackId="a" fill="#c4c4c4" />
      </BarChart>
    </ResponsiveContainer>
  );
}
