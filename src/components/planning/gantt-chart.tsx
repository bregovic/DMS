"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Check, Lock, Hand, HardHat, Package, CircleCheck } from "lucide-react";
import { setTaskStatus } from "@/server/actions/tasks";
import { formatDate } from "@/lib/utils";
import { TaskDetailDialog } from "@/components/planning/task-detail-dialog";
import { RequestDetailDialog } from "@/components/planning/request-detail-dialog";

/** Co brání fázi začít (stav připravenosti). Pořadí = závažnost. */
export type ReadinessKind = "blocked" | "waiting" | "vendor" | "material" | "ready";
export type Readiness = {
  state: ReadinessKind;
  reasons: { kind: ReadinessKind; text: string }[];
};

const READINESS: Record<ReadinessKind, { label: string; Icon: typeof Lock; cls: string }> = {
  blocked: { label: "Blokováno", Icon: Hand, cls: "text-red-600" },
  waiting: { label: "Čeká na", Icon: Lock, cls: "text-red-500" },
  vendor: { label: "Chybí dodavatel", Icon: HardHat, cls: "text-orange-500" },
  material: { label: "Neobjednáno", Icon: Package, cls: "text-orange-500" },
  ready: { label: "Připraveno", Icon: CircleCheck, cls: "text-emerald-600" },
};

function readinessTitle(r: Readiness) {
  if (r.state === "ready") return "Připraveno – nic nebrání začít";
  return r.reasons.map((x) => `${READINESS[x.kind].label}: ${x.text}`).join("\n");
}

function ReadinessIcon({ r, small }: { r?: Readiness; small?: boolean }) {
  if (!r) return null;
  const { Icon, cls } = READINESS[r.state];
  return (
    <span className="ml-1 shrink-0" title={readinessTitle(r)} aria-label={READINESS[r.state].label}>
      <Icon className={`${small ? "size-2.5" : "size-3"} ${cls}`} />
    </span>
  );
}

/** Měřítko osy: „Vše“ = celý plán na šířku obrazovky, jinak pevně px na den a posun do stran. */
const ZOOMS = [
  { key: "fit", label: "Vše", ppd: 0 },
  { key: "month", label: "Měsíce", ppd: 4 },
  { key: "week", label: "Týdny", ppd: 12 },
  { key: "day", label: "Dny", ppd: 34 },
] as const;
type ZoomKey = (typeof ZOOMS)[number]["key"];
const ZOOM_STORE = "dms-gantt-zoom";

export type GanttChild = {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  done: boolean;
  percentDone?: number;
  procurementLate?: boolean;
  requestId?: string; // dílčí řádek je výběrové řízení (žádanka)
  statusLabel: string;
  assigneeEmail: string | null;
  readiness?: Readiness;
};

export type GanttItem = {
  id: string;
  name: string;
  start: Date | null;
  end: Date | null;
  done?: boolean;
  percentDone?: number; // 0–100
  procurementLate?: boolean; // navázaná žádanka neobjednaná včas
  requestId?: string; // u kind="request": id žádanky pro detail
  kind?: "phase" | "task" | "request";
  prereqMet?: boolean; // fáze: všechny dílčí úkoly hotové (prerekvizity)
  blocked?: boolean; // fáze: některá fáze, na kterou navazuje, není hotová
  blockedBy?: string[]; // názvy fází, na které čeká
  readiness?: Readiness; // co brání začít (nehotové fáze/úkoly)
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

export function GanttChart({
  items,
  today,
  readOnly = false,
}: {
  items: GanttItem[];
  today: Date;
  /** Jen k nahlédnutí (dodavatel bez přístupu do projektu): bez detailu a odškrtávání. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reqId, setReqId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<ZoomKey>("fit");
  const [showAllBlockers, setShowAllBlockers] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const z = localStorage.getItem(ZOOM_STORE);
      if (z && ZOOMS.some((x) => x.key === z)) setZoom(z as ZoomKey);
    } catch {}
  }, []);
  const ppd = ZOOMS.find((z) => z.key === zoom)!.ppd;
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
  const monthTicks = () => {
    const cur = new Date(min);
    cur.setDate(1);
    cur.setHours(0, 0, 0, 0);
    if (cur.getTime() < min) cur.setMonth(cur.getMonth() + 1);
    while (cur.getTime() <= max) {
      ticks.push({ left: pct(cur.getTime()), label: cur.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" }), strong: true });
      cur.setMonth(cur.getMonth() + 1);
    }
  };
  if (zoom === "day") {
    const cur = startOfDay(new Date(min));
    while (cur.getTime() <= max) {
      const first = cur.getDate() === 1;
      ticks.push({
        left: pct(cur.getTime()),
        label: first ? cur.toLocaleDateString("cs-CZ", { month: "short" }) : String(cur.getDate()),
        strong: first || cur.getDay() === 1,
      });
      cur.setDate(cur.getDate() + 1);
    }
  } else if (zoom === "month") {
    monthTicks();
  } else if (zoom === "week" || dayCount <= 95) {
    const cur = startOfDay(new Date(min));
    const dow = (cur.getDay() + 6) % 7;
    cur.setDate(cur.getDate() - dow + (dow === 0 ? 0 : 7));
    while (cur.getTime() <= max) {
      ticks.push({ left: pct(cur.getTime()), label: shortDate(cur.getTime()), strong: cur.getDate() <= 7 });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    monthTicks();
  }
  // Víkendy podbarvit, jen když je den dost široký, aby to bylo vidět.
  const weekends: { left: number; width: number }[] = [];
  if (zoom === "day" || zoom === "week") {
    const cur = startOfDay(new Date(min));
    cur.setDate(cur.getDate() + ((6 - cur.getDay() + 7) % 7)); // nejbližší sobota
    while (cur.getTime() <= max) {
      weekends.push({ left: pct(cur.getTime()), width: (2 * DAY * 100) / span });
      cur.setDate(cur.getDate() + 7);
    }
  }
  const timelinePx = ppd > 0 ? Math.round(dayCount * ppd) : 0;

  // Po změně měřítka posunout osu tak, aby „dnes“ bylo v první třetině.
  const todayPx = ppd > 0 ? ((t0 - min) / DAY) * ppd : 0;
  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el || ppd === 0) return;
    el.scrollLeft = Math.max(0, todayPx - el.clientWidth / 3);
  };
  useEffect(scrollToToday, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // „Co brání“: nehotové, nepřipravené a začínají do 4 týdnů (nebo už běží)
  const horizon = t0 + 28 * DAY;
  const blockers = items
    .filter((it) => it.readiness && it.readiness.state !== "ready" && !it.done)
    .filter((it) => {
      const st = (it.start ?? it.end)?.getTime();
      return st != null && st <= horizon;
    });
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
    if (p >= 100) return "bg-emerald-700"; // hotovo → vkusná tmavší zelená
    const s = start ? startOfDay(start).getTime() : null;
    const e = end ? startOfDay(end).getTime() : null;
    // otevřené a po termínu → červená (ať pruh, ať milník)
    if (e != null && e < t0) return "bg-red-500";
    if (s != null && e != null && e > s) {
      if (t0 < s) return "bg-stone-800"; // ještě nezačalo → nikdy červené
      const total = e - s;
      const expected = Math.min(1, Math.max(0, (t0 - s) / total)) * 100;
      const dayPct = 100 / (total / DAY); // tolerance 1 den
      if (p < expected - dayPct) return "bg-red-500"; // pozadu
      if (e - t0 <= 14 * DAY) return "bg-amber-500";
      return "bg-stone-800";
    }
    if (e != null && e - t0 <= 14 * DAY) return "bg-amber-500";
    return "bg-stone-800";
  }
  // VŘ (žádanka) – běžící výběrko není červené; červené až po termínu rozhodnutí.
  function reqColor(end: Date | null, done: boolean) {
    if (done) return "bg-emerald-700";
    if (!end) return "bg-stone-800";
    const e = startOfDay(end).getTime();
    if (e < t0) return "bg-red-500";
    if (e - t0 <= 14 * DAY) return "bg-amber-500";
    return "bg-stone-800";
  }
  /**
   * Neobjednaná žádanka je varování, ne skluz.
   *
   * Dřív barvila pruh červeně vždy – i když postup podle procent seděl
   * s plánem. Červená teď patří jen tomu, co je opravdu pozadu (po termínu
   * nebo méně % než odpovídá uplynulému času); neobjednaná žádanka u úkolu,
   * který jinak jde podle plánu, je oranžová.
   */
  function withProcurement(base: string, late?: boolean) {
    if (!late) return base;
    if (base === "bg-red-500" || base === "bg-emerald-700") return base;
    return "bg-orange-500";
  }
  function color(it: GanttItem) {
    if (it.kind === "request") return reqColor(it.end ?? null, !!it.done);
    return withProcurement(
      colorFor(it.start ?? null, it.end ?? null, !!it.done, it.percentDone),
      it.procurementLate,
    );
  }
  const effPct = (done?: boolean, pct?: number) => (done ? 100 : pct ?? 0);

  // Šířka popisku je responzivní (úzká na mobilu, ať gantt nezabere půl displeje).
  const LABEL = "var(--gantt-label)";

  return (
    <div className="[--gantt-label:8.5rem] sm:[--gantt-label:13rem]">
      {/* Co brání v příštích 4 týdnech */}
      {blockers.length > 0 && (
        <div className="mb-5 border border-orange-200 bg-orange-50/60 p-3">
          <p className="kicker !text-orange-700">Co brání v příštích 4 týdnech · {blockers.length}</p>
          <ul className="mt-2 space-y-1.5">
            {(showAllBlockers ? blockers : blockers.slice(0, 6)).map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => (readOnly ? undefined : it.kind === "request" ? it.requestId && setReqId(it.requestId) : setDetailId(it.id))}
                  className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-2 text-left text-sm hover:underline"
                >
                  <span className="flex items-center font-medium text-stone-900">
                    {it.name}
                    <ReadinessIcon r={it.readiness} />
                  </span>
                  <span className="text-xs text-stone-500">
                    {it.start ? `od ${formatDate(it.start)}` : it.end ? `do ${formatDate(it.end)}` : ""}
                  </span>
                  <span className="basis-full text-xs text-stone-600">
                    {it.readiness!.reasons
                      .slice(0, 4)
                      .map((x) => `${READINESS[x.kind].label}: ${x.text}`)
                      .join(" · ")}
                    {it.readiness!.reasons.length > 4 ? ` · +${it.readiness!.reasons.length - 4}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {blockers.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllBlockers((v) => !v)}
              className="mt-2 cursor-pointer text-xs text-orange-700 underline-offset-2 hover:underline"
            >
              {showAllBlockers ? "Méně" : `Zobrazit všech ${blockers.length}`}
            </button>
          )}
        </div>
      )}

      {/* Měřítko */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex border border-stone-300" role="group" aria-label="Měřítko časové osy">
          {ZOOMS.map((z) => (
            <button
              key={z.key}
              type="button"
              aria-pressed={zoom === z.key}
              onClick={() => {
                setZoom(z.key);
                try {
                  localStorage.setItem(ZOOM_STORE, z.key);
                } catch {}
              }}
              className={`h-8 cursor-pointer px-3 text-xs transition-colors ${
                zoom === z.key ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
        {ppd > 0 && (
          <button
            type="button"
            onClick={scrollToToday}
            className="h-8 cursor-pointer border border-stone-300 px-3 text-xs text-stone-600 hover:border-stone-950"
          >
            Dnes
          </button>
        )}
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
      <div
        className={ppd > 0 ? "" : "min-w-[600px] sm:min-w-[720px]"}
        style={ppd > 0 ? { width: `calc(${LABEL} + ${timelinePx}px)` } : undefined}
      >
        {/* osa */}
        <div className="flex">
          <div className="sticky left-0 z-20 shrink-0 bg-white" style={{ width: LABEL }} />
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
              {weekends.map((w, i) => (
                <div
                  key={`we${i}`}
                  className="absolute inset-y-0 bg-stone-100/70"
                  style={{ left: `${w.left}%`, width: `${w.width}%` }}
                />
              ))}
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
                  className="group relative flex cursor-pointer items-center border-b border-stone-100 transition-colors hover:bg-stone-50/80"
                  onClick={() =>
                    readOnly
                      ? isPhase && (it.children ?? []).length > 0 && toggle(it.id)
                      : it.kind === "request"
                        ? it.requestId && setReqId(it.requestId)
                        : setDetailId(it.id)
                  }
                >
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-1 truncate bg-white py-2.5 pr-3 text-sm group-hover:bg-stone-50"
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
                    {it.readiness ? (
                      <ReadinessIcon r={it.readiness} />
                    ) : (
                      it.blocked && (
                        <span className="ml-1 shrink-0" title={`Čeká na: ${(it.blockedBy ?? []).join(", ")}`}>
                          <Lock className="size-3 text-red-500" />
                        </span>
                      )
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
                        const kc = k.requestId
                          ? reqColor(k.end ?? null, k.done)
                          : withProcurement(
                              colorFor(k.start ?? null, k.end ?? null, k.done, k.percentDone),
                              k.procurementLate,
                            );
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
                            onClick={() => (readOnly ? undefined : k.requestId ? setReqId(k.requestId) : setDetailId(k.id))}
                            className="flex cursor-pointer items-center border-t border-stone-100/80 first:border-t-0 hover:bg-white/70"
                          >
                            <div
                              className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 bg-stone-50 py-1.5 pl-8 pr-3 text-xs"
                              style={{ width: LABEL }}
                            >
                              {k.requestId ? (
                                <span className="kicker shrink-0 !text-red-500">VŘ</span>
                              ) : readOnly ? (
                                <span className={`size-2 shrink-0 rounded-full ${k.done ? "bg-emerald-600" : "bg-stone-300"}`} />
                              ) : (
                                <ChildCheck id={k.id} done={k.done} />
                              )}
                              <span
                                className={`truncate ${k.done ? "text-stone-400 line-through" : "text-stone-700"}`}
                                title={k.title}
                              >
                                {k.title}
                              </span>
                              {k.readiness && k.readiness.state !== "ready" && <ReadinessIcon r={k.readiness} small />}
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

      </div>
      </div>

        {/* legenda */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-500" /> po termínu / pozadu</span>
          {(Object.keys(READINESS) as ReadinessKind[]).map((k) => {
            const { Icon, cls, label } = READINESS[k];
            return (
              <span key={k} className="flex items-center gap-1.5"><Icon className={`size-3 ${cls}`} /> {label.toLowerCase()}</span>
            );
          })}
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-orange-500" /> podle plánu, ale neobjednaná žádanka</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-500" /> do 14 dnů</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-stone-800" /> v plánu</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-700" /> hotovo</span>
        </div>

      {detailId && (
        <TaskDetailDialog
          id={detailId}
          onClose={() => setDetailId(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {reqId && (
        <RequestDetailDialog
          id={reqId}
          onClose={() => setReqId(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
