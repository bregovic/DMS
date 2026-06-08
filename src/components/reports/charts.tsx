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

// odstíny šedi – monochrom
const GRAYS = [
  "#0a0a0a",
  "#404040",
  "#737373",
  "#a3a3a3",
  "#c4c4c4",
  "#525252",
  "#8a8a8a",
  "#d6d3ce",
];

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
          innerRadius={56}
          outerRadius={96}
          paddingAngle={1}
          stroke="#ffffff"
          strokeWidth={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={GRAYS[i % GRAYS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={tooltipStyle}
        />
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
        <li
          key={d.name}
          className="flex items-center justify-between border-b border-stone-100 pb-2 text-sm last:border-0"
        >
          <span className="flex items-center gap-2 text-stone-600">
            <span
              className="size-2.5"
              style={{ backgroundColor: GRAYS[i % GRAYS.length] }}
            />
            {d.name}
          </span>
          <span className="font-mono text-stone-950">
            {formatCurrency(d.total)}
          </span>
        </li>
      ))}
    </ul>
  );
}
