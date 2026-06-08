"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

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
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value)), "Výdaje"]}
          cursor={{ fill: "#f1f5f9" }}
        />
        <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProjectPieChart({
  data,
}: {
  data: { name: string; total: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ChartLegend({
  data,
}: {
  data: { name: string; total: number }[];
}) {
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-slate-600">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {d.name}
          </span>
          <span className="font-medium text-slate-900">
            {formatCurrency(d.total)}
          </span>
        </li>
      ))}
    </ul>
  );
}
