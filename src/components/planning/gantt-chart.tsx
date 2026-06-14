"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Check, Lock } from "lucide-react";
import { setTaskStatus } from "@/server/actions/tasks";
import { formatDate } from "@/lib/utils";
import { TaskDetailDialog } from "@/components/planning/task-detail-dialog";

export type GanttChild = {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  done: boolean;
  percentDone?: number;
  procurementLate?: boolean;
  statusLabel: string;
  assigneeEmail: string | null;
};

export type GanttItem = {
  id: string;
  name: string;
  start: Date | null;
  end: Date | null;
  done?: boolean;
  percentDone?: number; // 0–100
  procurementLate?: boolean; // navázaná žádanka neobjednaná včas
  kind?: "phase" | "task" | "request";
  prereqMet?: boolean; // fáze: všechny dílčí úkoly hotové (prerekvizity)
  blocked?: boolean; // fáze: některá fáze, na kterou navazuje, není hotová
  blockedBy?: string[]; // názvy fází, na které čeká
  children?: GanttChild[];
};

const DAY = 86400000;
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Klikací odškrtnutí dílčího úkolu (splnit / vrátit).
function ChildCheck({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={done ? "Označit jako nehotové" : "Označit jako hotové"}
      onClick={(ev) => {
        ev.stopPropagation();
        const fd = new FormData();
        fd.set("id", id);
        fd.set("status", done ? "todo" : "done");
        start(async () => {
          try {
            await setTaskStatus(fd);
          } catch {
            window.alert("Změna se nezdařila (nemáš oprávnění?).");
          }
        });
      }}
      className={`flex size-4 shrink-0 items-center justify-center border transition-colors disabled:opacity-50 cursor-pointer ${
        done
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 text-transparent hover:border-stone-950"
      }`}
    >
      <Check className="size-2.5" />
    </button>
  );
}

export function GanttChart({ items, today }: { items: GanttItem[]; today: Date }) {
  const router = useRouter();
  const [detailId, setDetailId] = useState<string | null>(null);
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

  // Barva podle skutečného postupu vs. plánu: červená jen když je % dokončení
  // k dnešku menší, než odpovídá uplynulému času (víc než ~1 den pozadu).
  function colorFor(
    start: Date | null,
    end: Date | null,
    done: boolean,
    percentDone?: number,
  ) {
    const p = done ? 100 : percentDone ?? 0;
    if (p >= 100) return "bg-stone-300";
    const s = start ? startOfDay(start).getTime() : null;
    const e = end ? startOfDay(end).getTime() : null;
    if (s != null && e != null && e > s) {
      if (t0 < s) return "bg-stone-800"; // ještě nezačalo → nikdy červené
      const total = e - s;
      const expected = Math.min(1, Math.max(0, (t0 - s) / total)) * 100;
      const dayPct = 100 / (total / DAY); // tolerance 1 den
      if (p < expected - dayPct) return "bg-red-500"; // pozadu
      if (e - t0 <= 14 * DAY) return "bg-amber-500";
      return "bg-stone-800";
    }
    // jen termín (milník) – červená když je po termínu a nehotovo
    if (e != null && e < t0) return "bg-red-500";
    if (e != null && e - t0 <= 14 * DAY) return "bg-amber-500";
    return "bg-stone-800";
  }
  function color(it: GanttItem) {
    if (it.kind === "request") return it.done ? "bg-stone-300" : "bg-red-500";
    if (it.procurementLate) return "bg-red-500"; // žádanka neobjednaná včas
    return colorFor(it.start ?? null, it.end ?? null, !!it.done, it.percentDone);
  }
  const effPct = (done?: boolean, pct?: number) => (done ? 100 : pct ?? 0);

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
            const itpct = it.kind === "request" ? 0 : effPct(it.done, it.percentDone);
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
                    it.kind !== "request" ? "cursor-pointer" : ""
                  }`}
                  onClick={it.kind !== "request" ? () => setDetailId(it.id) : undefined}
                >
                  <div
                    className="flex shrink-0 items-center gap-1 truncate py-2.5 pr-3 text-sm"
                    style={{ width: LABEL }}
                    title={it.name}
                  >
                    {isPhase && kids.length > 0 ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggle(it.id);
                        }}
                        title={expanded ? "Sbalit úkoly" : "Rozbalit úkoly"}
                        className="flex size-4 shrink-0 items-center justify-center text-stone-400 hover:text-stone-900 cursor-pointer"
                      >
                        <ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
                      </button>
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className={`truncate ${isPhase ? "font-semibold text-stone-900" : "text-stone-800"}`}>
                      {it.kind === "request" && (
                        <span className="kicker mr-1 !text-red-500">VŘ</span>
                      )}
                      {it.kind === "request" ? it.name.replace(/^Žádanka:\s*/, "") : it.name}
                    </span>
                    {isPhase && kids.length > 0 && (
                      <span className="ml-1 shrink-0 text-[11px] text-stone-400">{doneKids}/{kids.length}</span>
                    )}
                    {it.blocked && (
                      <span
                        className="ml-1 shrink-0"
                        title={`Čeká na: ${(it.blockedBy ?? []).join(", ")}`}
                      >
                        <Lock className="size-3 text-red-500" />
                      </span>
                    )}
                  </div>
                  <div className="relative h-10 flex-1">
                    {bar && s != null && e != null && (
                      <div
                        className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-sm ${c} shadow-sm`}
                        style={{ left: `${pct(s)}%`, width: `${Math.max(pct(e) - pct(s), 1.2)}%` }}
                        title={`${it.name}: ${range} · ${itpct} %`}
                      >
                        {itpct > 0 && (
                          <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${itpct}%` }} />
                        )}
                        <span className="relative truncate px-1.5 text-[10px] font-medium text-white">{range}</span>
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

                {/* rozbalená fáze = Gantt posloupnost dílčích úkolů na stejné ose */}
                {isPhase && expanded && kids.length > 0 && (
                  <div className="border-b border-stone-200 bg-stone-50/50">
                    {[...kids]
                      .sort(
                        (a, b) =>
                          ((a.start ?? a.end)?.getTime() ?? 0) -
                          ((b.start ?? b.end)?.getTime() ?? 0),
                      )
                      .map((k) => {
                        const ks = k.start ? startOfDay(k.start).getTime() : null;
                        const ke = k.end ? startOfDay(k.end).getTime() : null;
                        const kbar = ks != null && ke != null && ke > ks;
                        const kpoint = !kbar ? ke ?? ks : null;
                        const kc = k.procurementLate
                          ? "bg-red-500"
                          : colorFor(k.start ?? null, k.end ?? null, k.done, k.percentDone);
                        const kpct = effPct(k.done, k.percentDone);
                        const krange = kbar
                          ? `${formatDate(k.start!)} – ${formatDate(k.end!)}`
                          : k.end
                            ? formatDate(k.end)
                            : k.start
                              ? formatDate(k.start)
                              : "bez termínu";
                        const tip = `${k.title} · ${krange} · ${k.statusLabel} · ${kpct} %${k.assigneeEmail ? ` · ${k.assigneeEmail}` : ""}`;
                        return (
                          <div
                            key={k.id}
                            onClick={() => setDetailId(k.id)}
                            className="flex cursor-pointer items-center border-t border-stone-100/80 first:border-t-0 hover:bg-white/70"
                          >
                            <div
                              className="flex shrink-0 items-center gap-1.5 py-1.5 pl-8 pr-3 text-xs"
                              style={{ width: LABEL }}
                            >
                              <ChildCheck id={k.id} done={k.done} />
                              <span
                                className={`truncate ${k.done ? "text-stone-400 line-through" : "text-stone-700"}`}
                                title={k.title}
                              >
                                {k.title}
                              </span>
                            </div>
                            <div className="relative h-7 flex-1">
                              {kbar && ks != null && ke != null && (
                                <div
                                  className={`absolute top-1/2 h-3.5 -translate-y-1/2 overflow-hidden rounded-sm ${kc} shadow-sm`}
                                  style={{ left: `${pct(ks)}%`, width: `${Math.max(pct(ke) - pct(ks), 0.8)}%` }}
                                  title={tip}
                                >
                                  {kpct > 0 && (
                                    <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${kpct}%` }} />
                                  )}
                                </div>
                              )}
                              {kpoint != null && (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2"
                                  style={{ left: `${pct(kpoint)}%` }}
                                  title={tip}
                                >
                                  <span className={`block size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] ${kc} shadow-sm`} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* legenda */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-500" /> pozadu oproti plánu (% &lt; čas)</span>
          <span className="flex items-center gap-1.5"><Lock className="size-3 text-red-500" /> čeká na jinou fázi</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-500" /> do 14 dnů</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-stone-800" /> v plánu</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-stone-300" /> hotovo</span>
        </div>
      </div>

      {detailId && (
        <TaskDetailDialog
          id={detailId}
          onClose={() => setDetailId(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
