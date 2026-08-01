"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  fillAvailability,
  clearAvailability,
  getVendorAvailability,
} from "@/server/actions/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";

const WD = [
  { v: 1, l: "Po" },
  { v: 2, l: "Út" },
  { v: 3, l: "St" },
  { v: 4, l: "Čt" },
  { v: 5, l: "Pá" },
  { v: 6, l: "So" },
  { v: 0, l: "Ne" },
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function VendorAvailabilityDialog({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [from, setFrom] = useState(iso(today));
  const [to, setTo] = useState(iso(addMonths(today, 2)));
  const [available, setAvailable] = useState("1");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [map, setMap] = useState<Map<string, boolean>>(new Map());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const start = new Date(view.getFullYear(), view.getMonth(), 1);
    const end = addMonths(view, 3);
    end.setDate(0); // poslední den 3. měsíce
    const rows = await getVendorAvailability(vendorId, iso(start), iso(end));
    setMap(new Map(rows.map((r) => [r.date, r.available])));
  }, [vendorId, view]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggleDay = (v: number) =>
    setDays((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  async function run(action: typeof fillAvailability, withDays: boolean) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("vendorId", vendorId);
      fd.set("from", from);
      fd.set("to", to);
      fd.set("available", available);
      if (withDays) days.forEach((d) => fd.append("wd", String(d)));
      await action(fd);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Akce selhala.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Kalendář dostupnosti"
        className="flex size-8 items-center justify-center text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
      >
        <CalendarDays className="size-4" />
      </button>
    );
  }

  const months = [view, addMonths(view, 1), addMonths(view, 2)];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/30 p-0 py-0 sm:p-4 sm:py-12">
      <div className="w-full max-w-3xl border border-stone-300 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="kicker">Dostupnost · {vendorName}</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-950 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* plnění */}
          <div className="space-y-3 border border-stone-200 bg-stone-50/60 p-4">
            <div className="flex flex-wrap gap-1.5">
              {WD.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => toggleDay(d.v)}
                  className={`h-8 w-10 border text-xs font-medium transition-colors cursor-pointer ${
                    days.includes(d.v)
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-300 text-stone-600 hover:border-stone-950"
                  }`}
                >
                  {d.l}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDays([1, 2, 3, 4, 5])}
                className="ml-1 h-8 px-2 text-xs text-stone-500 underline-offset-2 hover:text-stone-950 hover:underline cursor-pointer"
              >
                všední dny
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="av-from">Od</Label>
                <DateInput id="av-from" value={from} onChange={setFrom} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="av-to">Do</Label>
                <DateInput id="av-to" value={to} onChange={setTo} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="av-state">Stav</Label>
                <select
                  id="av-state"
                  value={available}
                  onChange={(e) => setAvailable(e.target.value)}
                  className="flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 text-sm text-stone-950 focus-visible:outline-none focus-visible:border-stone-950"
                >
                  <option value="1">Dostupný</option>
                  <option value="0">Nedostupný</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" disabled={busy} onClick={() => run(fillAvailability, true)}>
                  Naplnit
                </Button>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(clearAvailability, false)}
              className="text-xs text-stone-500 underline-offset-2 hover:text-red-600 hover:underline cursor-pointer disabled:opacity-50"
            >
              Smazat dostupnost v tomto rozmezí
            </button>
          </div>

          {/* kalendář */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView(addMonths(view, -1))}
                className="flex size-7 items-center justify-center border border-stone-300 text-stone-500 hover:border-stone-950 hover:text-stone-950 cursor-pointer"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-xs text-stone-500">
                <span className="mr-3 inline-flex items-center gap-1"><span className="size-2.5 bg-emerald-500" /> dostupný</span>
                <span className="inline-flex items-center gap-1"><span className="size-2.5 bg-rose-400" /> nedostupný</span>
              </span>
              <button
                type="button"
                onClick={() => setView(addMonths(view, 1))}
                className="flex size-7 items-center justify-center border border-stone-300 text-stone-500 hover:border-stone-950 hover:text-stone-950 cursor-pointer"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {months.map((m) => (
                <Month key={iso(m)} month={m} map={map} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Month({ month, map }: { month: Date; map: Map<string, boolean> }) {
  const y = month.getFullYear();
  const mo = month.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const first = new Date(y, mo, 1);
  const lead = (first.getDay() + 6) % 7; // Po=0
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const title = first.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  return (
    <div>
      <p className="mb-1 text-xs font-medium capitalize text-stone-700">{title}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
        {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((d) => (
          <span key={d} className="text-stone-400">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <span key={i} />;
          const key = `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const av = map.get(key);
          const cls =
            av === true
              ? "bg-emerald-500 text-white"
              : av === false
                ? "bg-rose-400 text-white"
                : "text-stone-600";
          return (
            <span key={i} className={`py-0.5 ${cls}`}>
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
