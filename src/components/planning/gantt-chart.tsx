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
const shortDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
};

// Ganttova mapa s časovou mřížkou: pruh start→termín, jen termín = milník.
// Barva podle splatnosti (po termínu / do 14 dnů / v plánu), hotové tlumeně.
export function GanttChart({ items, today }: { items: GanttItem[]; today: Date }) {
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

  // Adaptivní mřížka: krátké období → po týdnech, dlouhé → po měsících.
  const ticks: { left: number; label: string; strong?: boolean }[] = [];
  if (dayCount <= 95) {
    const cur = startOfDay(new Date(min));
    // posuň na nejbližší pondělí
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
      ticks.push({
        left: pct(cur.getTime()),
        label: cur.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" }),
        strong: true,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  const todayLeft = pct(t0);
  const todayInRange = todayLeft >= 0 && todayLeft <= 100;

  function color(it: GanttItem) {
    if (it.done) return "bg-stone-300";
    if (!it.end) return "bg-stone-500";
    const e = startOfDay(it.end).getTime();
    if (e < t0) return "bg-red-500";
    if (e - t0 <= 14 * DAY) return "bg-amber-500";
    return "bg-stone-800";
  }

  const LABEL = "11rem";

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        {/* osa */}
        <div className="flex">
          <div className="shrink-0" style={{ width: LABEL }} />
          <div className="relative h-6 flex-1">
            {ticks.map((tk, i) => (
              <span
                key={i}
                className={`absolute top-1 -translate-x-1/2 text-[10px] tabular-nums ${
                  tk.strong ? "font-medium text-stone-500" : "text-stone-400"
                }`}
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

        {/* tělo s mřížkou */}
        <div className="relative border-t border-stone-200">
          {/* mřížka + dnešní linka (na pozadí, zarovnané s časovou osou) */}
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: LABEL, right: 0 }}
          >
            <div className="relative h-full">
              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className={`absolute inset-y-0 border-l ${
                    tk.strong ? "border-stone-200" : "border-stone-100"
                  }`}
                  style={{ left: `${tk.left}%` }}
                />
              ))}
              {todayInRange && (
                <div
                  className="absolute inset-y-0 border-l-2 border-stone-900/50"
                  style={{ left: `${todayLeft}%` }}
                />
              )}
            </div>
          </div>

          {/* řádky */}
          {items.map((it) => {
            const s = it.start ? startOfDay(it.start).getTime() : null;
            const e = it.end ? startOfDay(it.end).getTime() : null;
            const bar = s != null && e != null && e > s;
            const point = !bar ? e ?? s : null;
            const c = color(it);
            const range =
              s != null && e != null && e > s
                ? `${formatDate(it.start!)} – ${formatDate(it.end!)}`
                : it.end
                  ? formatDate(it.end)
                  : it.start
                    ? formatDate(it.start)
                    : "";
            return (
              <div
                key={it.id}
                className="group relative flex items-center border-b border-stone-100 transition-colors hover:bg-stone-50/80"
              >
                <div
                  className="shrink-0 truncate py-2.5 pr-3 text-sm text-stone-800"
                  style={{ width: LABEL, paddingLeft: `${it.level * 14}px` }}
                  title={it.name}
                >
                  {it.name}
                </div>
                <div className="relative h-10 flex-1">
                  {bar && s != null && e != null && (
                    <div
                      className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center rounded-sm ${c} shadow-sm transition-transform group-hover:scale-y-110`}
                      style={{ left: `${pct(s)}%`, width: `${Math.max(pct(e) - pct(s), 1.2)}%` }}
                      title={`${it.name}: ${range}`}
                    >
                      <span className="truncate px-1.5 text-[10px] font-medium text-white">
                        {range}
                      </span>
                    </div>
                  )}
                  {point != null && (
                    <div
                      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1"
                      style={{ left: `${pct(point)}%` }}
                      title={`${it.name}: ${range}`}
                    >
                      <span className={`size-3 -translate-x-1/2 rotate-45 rounded-[2px] ${c} shadow-sm`} />
                      <span className="whitespace-nowrap text-[10px] text-stone-500">
                        {it.end ? formatDate(it.end) : formatDate(it.start!)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* legenda */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-red-500" /> po termínu
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-amber-500" /> do 14 dnů
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-stone-800" /> v plánu
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-stone-300" /> hotovo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rotate-45 rounded-[2px] bg-stone-500" /> milník
          </span>
        </div>
      </div>
    </div>
  );
}
