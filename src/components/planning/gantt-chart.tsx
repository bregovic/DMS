import { formatDate } from "@/lib/utils";

export type GanttItem = {
  id: string;
  name: string;
  start: Date | null;
  end: Date | null;
  level: number;
  dependsOnName: string | null;
  done?: boolean;
};

const DAY = 86400000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Jednoduchá Ganttova mapa: pruh start→termín, jen termín = milník (kosočtverec).
// Barva podle splatnosti: po termínu červená, do 14 dnů jantarová, jinak tmavá.
export function GanttChart({ items, today }: { items: GanttItem[]; today: Date }) {
  const t0 = startOfDay(today).getTime();
  const stamps: number[] = [t0];
  for (const i of items) {
    if (i.start) stamps.push(startOfDay(i.start).getTime());
    if (i.end) stamps.push(startOfDay(i.end).getTime());
  }
  let min = Math.min(...stamps);
  let max = Math.max(...stamps);
  min -= 4 * DAY;
  max += 4 * DAY;
  if (max - min < 21 * DAY) max = min + 21 * DAY;
  const span = max - min;
  const pct = (ms: number) => ((ms - min) / span) * 100;

  // měsíční mřížka
  const ticks: { left: number; label: string }[] = [];
  const cur = new Date(min);
  cur.setDate(1);
  cur.setHours(0, 0, 0, 0);
  while (cur.getTime() <= max) {
    ticks.push({
      left: pct(cur.getTime()),
      label: cur.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  const todayLeft = pct(t0);

  function color(it: GanttItem) {
    if (it.done) return "bg-stone-300";
    const end = it.end;
    if (!end) return "bg-stone-500";
    const e = startOfDay(end).getTime();
    if (e < t0) return "bg-red-500";
    if (e - t0 <= 14 * DAY) return "bg-amber-500";
    return "bg-stone-800";
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* osa */}
        <div className="flex">
          <div className="w-44 shrink-0" />
          <div className="relative h-5 flex-1 border-b border-stone-200">
            {ticks.map((tk, i) => (
              <span
                key={i}
                className="absolute top-0 -translate-x-1/2 text-[10px] uppercase tracking-wide text-stone-400"
                style={{ left: `${tk.left}%` }}
              >
                {tk.label}
              </span>
            ))}
          </div>
        </div>

        {/* řádky */}
        {items.map((it) => {
          const s = it.start ? startOfDay(it.start).getTime() : null;
          const e = it.end ? startOfDay(it.end).getTime() : null;
          const bar = s != null && e != null && e > s;
          const point = !bar ? (e ?? s) : null;
          const c = color(it);
          return (
            <div key={it.id} className="flex items-center">
              <div
                className="w-44 shrink-0 truncate py-2 pr-3 text-sm text-stone-800"
                style={{ paddingLeft: `${it.level * 14}px` }}
                title={it.name}
              >
                {it.name}
                {it.dependsOnName && (
                  <span className="ml-1 text-[10px] text-stone-400">
                    ⤷ {it.dependsOnName}
                  </span>
                )}
              </div>
              <div className="relative h-9 flex-1 border-b border-stone-100">
                {/* dnešní linka */}
                {todayLeft >= 0 && todayLeft <= 100 && (
                  <div
                    className="absolute inset-y-0 border-l border-dashed border-stone-950/30"
                    style={{ left: `${todayLeft}%` }}
                  />
                )}
                {bar && s != null && e != null && (
                  <div
                    className={`absolute top-1/2 h-4 -translate-y-1/2 ${c}`}
                    style={{
                      left: `${pct(s)}%`,
                      width: `${Math.max(pct(e) - pct(s), 1)}%`,
                    }}
                    title={`${it.name}: ${formatDate(it.start!)} – ${formatDate(it.end!)}`}
                  />
                )}
                {point != null && (
                  <div
                    className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 ${c}`}
                    style={{ left: `${pct(point)}%` }}
                    title={`${it.name}: ${it.end ? formatDate(it.end) : formatDate(it.start!)}`}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* legenda */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 bg-red-500" /> po termínu
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 bg-amber-500" /> do 14 dnů
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 bg-stone-800" /> v plánu
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 bg-stone-300" /> hotovo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rotate-45 bg-stone-500" /> milník
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 border-l border-dashed border-stone-950/40" />
            dnes
          </span>
        </div>
      </div>
    </div>
  );
}
