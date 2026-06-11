"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Check } from "lucide-react";
import { setTaskStatus } from "@/server/actions/tasks";
import { formatDate } from "@/lib/utils";

export type GanttChild = {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  done: boolean;
  statusLabel: string;
  assigneeEmail: string | null;
};

export type GanttItem = {
  id: string;
  name: string;
  start: Date | null;
  end: Date | null;
  done?: boolean;
  kind?: "phase" | "task";
  prereqMet?: boolean; // fáze: všechny dílčí úkoly hotové (prerekvizity)
  children?: GanttChild[];
};

const DAY = 86400000;
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Řádek dílčího úkolu s klikacím odškrtnutím (splnit / vrátit).
function ChildRow({ k }: { k: GanttChild }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        title={k.done ? "Označit jako nehotové" : "Označit jako hotové"}
        onClick={() => {
          const fd = new FormData();
          fd.set("id", k.id);
          fd.set("status", k.done ? "todo" : "done");
          start(async () => {
            try {
              await setTaskStatus(fd);
            } catch {
              window.alert("Změna se nezdařila (nemáš oprávnění?).");
            }
          });
        }}
        className={`flex size-4 shrink-0 items-center justify-center border transition-colors disabled:opacity-50 cursor-pointer ${
          k.done
            ? "border-stone-900 bg-stone-900 text-white"
            : "border-stone-300 text-transparent hover:border-stone-950"
        }`}
      >
        <Check className="size-2.5" />
      </button>
      <span className={`min-w-0 flex-1 truncate ${k.done ? "text-stone-400 line-through" : "text-stone-800"}`}>
        {k.title}
      </span>
      {k.assigneeEmail && <span className="shrink-0 text-stone-400">{k.assigneeEmail}</span>}
      {k.end && <span className="shrink-0 text-stone-500">do {formatDate(k.end)}</span>}
      <span className="shrink-0 border border-stone-300 px-1 text-[10px] uppercase tracking-wide text-stone-500">
        {k.statusLabel}
      </span>
    </li>
  );
}

export function GanttChart({ items, today }: { items: GanttItem[]; today: Date }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const t0 = startOfDay(today).getTime();
  const stamps: number[] = [t0];
  for (const i of items) {
    if (i.start) stamps.push(startOfDay(i.start).getTime());
    if (i.end) stamps.push(startOfDay(i.end).getTime());
  }
  let min = Math.min(...stamps);
  let max = Math.max(...stamps);
  min -= 3 * DAY;
  max += 5 * DAY;
  if (max - min < 21 * DAY) max = min + 21 * DAY;
  const span = max - min;
  const pct = (ms: number) => ((ms - min) / span) * 100;
  const dayCount = span / DAY;

  const shortDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()}. ${d.getMonth() + 1}.`;
  };
  const ticks: { left: number; label: string; strong?: boolean }[] = [];
  if (dayCount <= 95) {
    const cur = startOfDay(new Date(min));
    const dow = (cur.getDay() + 6) % 7;
    cur.setDate(cur.getDate() - dow + (dow === 0 ? 0 : 7));
    while (cur.getTime() <= max) {
      ticks.push({ left: pct(cur.getTime()), label: shortDate(cur.getTime()), strong: cur.getDate() <= 7 });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    const cur = new Date(min);
    cur.setDate(1);
    cur.setHours(0, 0, 0, 0);
    while (cur.getTime() <= max) {
      ticks.push({ left: pct(cur.getTime()), label: cur.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" }), strong: true });
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  const todayLeft = pct(t0);
  const todayInRange = todayLeft >= 0 && todayLeft <= 100;

  function color(it: GanttItem) {
    if (it.kind === "phase" && it.prereqMet === false) return "bg-red-500";
    if (it.done) return "bg-stone-300";
    if (!it.end) return "bg-stone-500";
    const e = startOfDay(it.end).getTime();
    if (e < t0) return "bg-red-500";
    if (e - t0 <= 14 * DAY) return "bg-amber-500";
    return "bg-stone-800";
  }

  const LABEL = "13rem";

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {/* osa */}
        <div className="flex">
          <div className="shrink-0" style={{ width: LABEL }} />
          <div className="relative h-6 flex-1">
            {ticks.map((tk, i) => (
              <span
                key={i}
                className={`absolute top-1 -translate-x-1/2 text-[10px] tabular-nums ${tk.strong ? "font-medium text-stone-500" : "text-stone-400"}`}
                style={{ left: `${tk.left}%` }}
              >
                {tk.label}
              </span>
            ))}
            {todayInRange && (
              <span
                className="absolute top-0 -translate-x-1/2 rounded-sm bg-stone-900 px-1 text-[9px] font-medium uppercase tracking-wide text-white"
                style={{ left: `${todayLeft}%` }}
              >
                dnes
              </span>
            )}
          </div>
        </div>

        {/* tělo */}
        <div className="relative border-t border-stone-200">
          <div className="pointer-events-none absolute inset-y-0" style={{ left: LABEL, right: 0 }}>
            <div className="relative h-full">
              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className={`absolute inset-y-0 border-l ${tk.strong ? "border-stone-200" : "border-stone-100"}`}
                  style={{ left: `${tk.left}%` }}
                />
              ))}
              {todayInRange && (
                <div className="absolute inset-y-0 border-l-2 border-stone-900/50" style={{ left: `${todayLeft}%` }} />
              )}
            </div>
          </div>

          {items.map((it) => {
            const s = it.start ? startOfDay(it.start).getTime() : null;
            const e = it.end ? startOfDay(it.end).getTime() : null;
            const bar = s != null && e != null && e > s;
            const point = !bar ? e ?? s : null;
            const c = color(it);
            const isPhase = it.kind === "phase";
            const expanded = open.has(it.id);
            const range =
              s != null && e != null && e > s
                ? `${formatDate(it.start!)} – ${formatDate(it.end!)}`
                : it.end
                  ? formatDate(it.end)
                  : it.start
                    ? formatDate(it.start)
                    : "";
            const kids = it.children ?? [];
            const doneKids = kids.filter((k) => k.done).length;
            return (
              <div key={it.id}>
                <div
                  className={`group relative flex items-center border-b border-stone-100 transition-colors hover:bg-stone-50/80 ${
                    isPhase && kids.length ? "cursor-pointer" : ""
                  }`}
                  onClick={isPhase && kids.length ? () => toggle(it.id) : undefined}
                >
                  <div
                    className="flex shrink-0 items-center gap-1 truncate py-2.5 pr-3 text-sm"
                    style={{ width: LABEL }}
                    title={it.name}
                  >
                    {isPhase && kids.length > 0 ? (
                      <ChevronRight className={`size-3.5 shrink-0 text-stone-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className={`truncate ${isPhase ? "font-semibold text-stone-900" : "text-stone-800"}`}>
                      {isPhase && <span className="kicker mr-1 !text-stone-400">Fáze</span>}
                      {it.name}
                    </span>
                    {isPhase && kids.length > 0 && (
                      <span className="ml-1 shrink-0 text-[11px] text-stone-400">{doneKids}/{kids.length}</span>
                    )}
                  </div>
                  <div className="relative h-10 flex-1">
                    {bar && s != null && e != null && (
                      <div
                        className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center rounded-sm ${c} shadow-sm`}
                        style={{ left: `${pct(s)}%`, width: `${Math.max(pct(e) - pct(s), 1.2)}%` }}
                        title={`${it.name}: ${range}`}
                      >
                        <span className="truncate px-1.5 text-[10px] font-medium text-white">{range}</span>
                      </div>
                    )}
                    {point != null && (
                      <div className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1" style={{ left: `${pct(point)}%` }} title={`${it.name}: ${range}`}>
                        <span className={`size-3 -translate-x-1/2 rotate-45 rounded-[2px] ${c} shadow-sm`} />
                        <span className="whitespace-nowrap text-[10px] text-stone-500">{range}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* rozbalený seznam dílčích úkolů */}
                {isPhase && expanded && kids.length > 0 && (
                  <div className="border-b border-stone-100 bg-stone-50/60 py-2 pl-8 pr-3">
                    <ul className="space-y-1.5">
                      {kids.map((k) => (
                        <ChildRow key={k.id} k={k} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* legenda */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-500" /> po termínu / nesplněné prerekvizity</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-500" /> do 14 dnů</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-stone-800" /> v plánu</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-stone-300" /> hotovo</span>
        </div>
      </div>
    </div>
  );
}
