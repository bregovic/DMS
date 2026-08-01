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

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/**
 * Dopočítá nedopsané datum, aby stačilo napsat jen den.
 *
 *   „15"        → 15. aktuálního měsíce a roku
 *   „15.3"      → 15. 3. aktuálního roku
 *   „15.3.26"   → 15.03.2026
 *   „31.2."     → 28.02. (nebo 29. v přestupném roce)
 *
 * Den nad počet dní v měsíci se srovná na poslední den, měsíc na 1–12.
 * Prázdný vstup zůstává prázdný – to je „bez filtru".
 */
function normalize(display: string, today = new Date()): string {
  const parts = display.split(".").map((p) => p.trim());
  const dRaw = parts[0] ?? "";
  if (!dRaw) return "";

  const mRaw = parts[1] ?? "";
  const yRaw = parts[2] ?? "";

  let year: number;
  if (!yRaw) year = today.getFullYear();
  else if (yRaw.length <= 2) year = (Number(yRaw) > 68 ? 1900 : 2000) + Number(yRaw);
  else year = Number(yRaw);
  if (!Number.isFinite(year) || year < 1000) year = today.getFullYear();

  let month = mRaw ? Number(mRaw) : today.getMonth() + 1;
  if (!Number.isFinite(month) || month < 1) month = 1;
  if (month > 12) month = 12;

  let day = Number(dRaw);
  if (!Number.isFinite(day) || day < 1) day = 1;
  const max = daysInMonth(year, month);
  if (day > max) day = max;

  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
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
  /** Zadání dopsané a potvrzené (opuštění pole nebo Enter). Dostane hotové
   *  ISO rovnou v parametru – volající nemusí čekat, až se překreslí stav. */
  onCommit?: (iso: string) => void;
};

export const DateInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, name, value, defaultValue, onChange, onCommit, disabled, required, id, ...rest }, ref) => {
    const controlled = value !== undefined;
    const [text, setText] = React.useState(() => fromIso(controlled ? value : defaultValue));
    const nativeRef = React.useRef<HTMLInputElement>(null);
    const hiddenRef = React.useRef<HTMLInputElement>(null);
    const textRef = React.useRef(text);
    textRef.current = text;
    const boxRef = React.useRef<HTMLDivElement>(null);

    // u řízeného pole přijmout změnu zvenčí, ale nepřepisovat rozepsané psaní
    React.useEffect(() => {
      if (controlled && toIso(text) !== value) setText(fromIso(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    /* Formuláře se po odeslání resetují přes form.reset(); nativní pole se
       vrátí samy, tohle si musí uklidit vlastní stav.

       Při odeslání navíc dopíšeme nedopsané datum rovnou do skrytého pole.
       Přes stav by to nestihlo – Enter odešle formulář dřív, než se
       komponenta překreslí, a odešla by se prázdná hodnota. */
    React.useEffect(() => {
      const form = boxRef.current?.closest("form");
      if (!form) return;
      const onReset = () => setText(fromIso(controlled ? value : defaultValue));
      const onSubmit = () => {
        if (hiddenRef.current) hiddenRef.current.value = toIso(normalize(textRef.current));
      };
      form.addEventListener("reset", onReset);
      form.addEventListener("submit", onSubmit, true); // capture: dřív než odeslání
      return () => {
        form.removeEventListener("reset", onReset);
        form.removeEventListener("submit", onSubmit, true);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controlled, value, defaultValue]);

    const push = (next: string) => {
      setText(next);
      onChange?.(toIso(next));
    };

    /** Dopsat nedopsané a ohlásit hotovou hodnotu. */
    const commit = () => {
      const n = normalize(text);
      const iso = toIso(n);
      if (n !== text) push(n);
      onCommit?.(iso);
    };

    const iso = toIso(text);

    return (
      <div ref={boxRef} className="relative">
        {name && <input ref={hiddenRef} type="hidden" name={name} value={iso} />}

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
            rest.onBlur?.(e);
            commit();
          }}
          onKeyDown={(e) => {
            rest.onKeyDown?.(e);
            if (e.key === "Enter") commit();
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
