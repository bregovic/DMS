// Barvy stavů a priorit. Třídy musí být zapsané jako celé literály (kvůli
// statickému skenování Tailwindu – `bg-${x}-500` by se nenašlo).

export type ColorKey =
  | "stone"
  | "amber"
  | "sky"
  | "emerald"
  | "rose"
  | "violet"
  | "blue";

type ColorSet = { chip: string; dot: string; bar: string };

export const STATUS_COLOR_CLASSES: Record<ColorKey, ColorSet> = {
  stone: { chip: "bg-stone-100 text-stone-600 border-stone-200", dot: "bg-stone-400", bar: "bg-stone-400" },
  amber: { chip: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500", bar: "bg-amber-500" },
  sky: { chip: "bg-sky-100 text-sky-800 border-sky-200", dot: "bg-sky-500", bar: "bg-sky-500" },
  emerald: { chip: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  rose: { chip: "bg-rose-100 text-rose-800 border-rose-200", dot: "bg-rose-500", bar: "bg-rose-500" },
  violet: { chip: "bg-violet-100 text-violet-800 border-violet-200", dot: "bg-violet-500", bar: "bg-violet-500" },
  blue: { chip: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500", bar: "bg-blue-500" },
};

export const COLOR_KEYS = Object.keys(STATUS_COLOR_CLASSES) as ColorKey[];

export function colorClasses(color?: string | null): ColorSet {
  return STATUS_COLOR_CLASSES[(color as ColorKey) ?? "stone"] ?? STATUS_COLOR_CLASSES.stone;
}

// Výchozí barvy vestavěných stavů úkolů.
export const TASK_STATUS_COLORS: Record<string, ColorKey> = {
  rozhodnout: "amber",
  todo: "stone",
  in_progress: "sky",
  done: "emerald",
  cancelled: "rose",
};
