"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zadávání data v českém formátu DD.MM.RRRR.
 *
 * Nativní <input type="date"> se v prohlížeči chová nepředvídatelně – kurzor
 * zůstává v části pro den, takže se pořád přepisuje dokola. Tady se píšou
 * prostě číslice a tečky se doplňují samy, takže po dni kurzor „přeskočí"
 * na měsíc.
 *
 * Ven se pořád posílá ISO (RRRR-MM-DD) skrytým polem s `name`, aby serverové
 * akce i FormData fungovaly beze změny. Kalendář z prohlížeče zůstává
 * dostupný přes ikonu.
 */

/** Číslice na „DD.MM.RRRR" – tečky se doplňují průběžně při psaní. */
export function formatTyped(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** „DD.MM.RRRR" na ISO. Prázdný řetězec = nehotové nebo neplatné datum. */
export function toIso(display: string): string {
  const m = display.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const date = new Date(yyyy, mm - 1, dd);
  // odchytí 31.02. a spol. – Date by to tiše přetočilo na březen
  if (date.getFullYear() !== yyyy || date.getMonth() !== mm - 1 || date.getDate() !== dd) return "";
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function fromIso(iso?: string | null): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** Doplní, co jde: jednociferný den/měsíc a dvouciferný rok (25 → 2025). */
function normalize(display: string): string {
  const parts = display.split(".");
  if (parts.length !== 3) return display;
  let [d, m, y] = parts;
  if (!d || !m || !y) return display;
  d = d.padStart(2, "0");
  m = m.padStart(2, "0");
  if (y.length === 2) y = (Number(y) > 68 ? "19" : "20") + y;
  return `${d}.${m}.${y}`;
}

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  /** ISO RRRR-MM-DD */
  value?: string;
  /** ISO RRRR-MM-DD */
  defaultValue?: string;
  /** Dostane ISO RRRR-MM-DD, nebo prázdný řetězec u nehotového data. */
  onChange?: (iso: string) => void;
};

export const DateInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, name, value, defaultValue, onChange, disabled, required, id, ...rest }, ref) => {
    const controlled = value !== undefined;
    const [text, setText] = React.useState(() => fromIso(controlled ? value : defaultValue));
    const nativeRef = React.useRef<HTMLInputElement>(null);
    const boxRef = React.useRef<HTMLDivElement>(null);

    // u řízeného pole přijmout změnu zvenčí, ale nepřepisovat rozepsané psaní
    React.useEffect(() => {
      if (controlled && toIso(text) !== value) setText(fromIso(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    /* Formuláře se po odeslání resetují přes form.reset(); nativní pole se
       vrátí samy, tohle si musí uklidit vlastní stav. */
    React.useEffect(() => {
      const form = boxRef.current?.closest("form");
      if (!form) return;
      const onReset = () => setText(fromIso(controlled ? value : defaultValue));
      form.addEventListener("reset", onReset);
      return () => form.removeEventListener("reset", onReset);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controlled, value, defaultValue]);

    const push = (next: string) => {
      setText(next);
      onChange?.(toIso(next));
    };

    const iso = toIso(text);

    return (
      <div ref={boxRef} className="relative">
        {name && <input type="hidden" name={name} value={iso} />}

        <input
          {...rest}
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD.MM.RRRR"
          maxLength={10}
          disabled={disabled}
          required={required}
          value={text}
          onChange={(e) => push(formatTyped(e.target.value))}
          onBlur={(e) => {
            const n = normalize(text);
            if (n !== text) push(n);
            rest.onBlur?.(e);
          }}
          className={cn(
            "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 py-2 pr-9 text-sm text-stone-950 placeholder:text-stone-400 transition-colors focus-visible:outline-none focus-visible:border-stone-950 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
            // rozepsané nebo nesmyslné datum (31.02.) – ať je to poznat
            text.length === 10 && !iso && "border-red-500",
            className,
          )}
        />

        {/* Kalendář z prohlížeče pro ty, kdo radši klikají. */}
        {!disabled && (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Vybrat z kalendáře"
              onClick={() => {
                const el = nativeRef.current;
                if (!el) return;
                if (typeof el.showPicker === "function") el.showPicker();
                else el.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900"
            >
              <CalendarDays size={16} />
            </button>
            <input
              ref={nativeRef}
              type="date"
              tabIndex={-1}
              aria-hidden
              value={iso}
              onChange={(e) => push(fromIso(e.target.value))}
              className="pointer-events-none absolute right-2 top-1/2 h-0 w-0 -translate-y-1/2 opacity-0"
            />
          </>
        )}
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
