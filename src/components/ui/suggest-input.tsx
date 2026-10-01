"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

const bez = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "list" | "value"
> & {
  /** Co už se v projektu psalo – nabízí se jen jako zkratka. */
  suggestions: string[];
  /** Kolik nejvýš nabídnout (víc se na telefon nevejde). */
  limit?: number;
};

/**
 * Textové pole s nenásilným našeptáváním.
 *
 * `<datalist>` vyskočí na telefonu přes klávesnici hned po klepnutí do pole,
 * takže to působí jako povinný výběr z číselníku. Tady se nabídka ukáže až
 * od dvou napsaných znaků a jen když se něco shoduje; psát jde cokoli.
 */
export function SuggestInput({
  suggestions,
  limit = 6,
  defaultValue = "",
  onChange,
  onKeyDown,
  ...rest
}: Props) {
  const [text, setText] = React.useState(String(defaultValue));
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);

  // Formulář se po odeslání resetuje; řízené pole si musí uklidit samo.
  React.useEffect(() => {
    const form = boxRef.current?.closest("form");
    if (!form) return;
    const onReset = () => setText(String(defaultValue));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);

  React.useEffect(() => {
    const venku = (e: Event) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", venku);
    document.addEventListener("touchstart", venku);
    return () => {
      document.removeEventListener("mousedown", venku);
      document.removeEventListener("touchstart", venku);
    };
  }, []);

  const q = bez(text.trim());
  const matches =
    q.length >= 2
      ? suggestions.filter((s) => bez(s).includes(q) && bez(s) !== q).slice(0, limit)
      : [];
  const show = open && matches.length > 0;

  return (
    <div ref={boxRef} className="relative">
      <Input
        {...rest}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          onChange?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && show) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          onKeyDown?.(e);
        }}
      />
      {show && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-stone-300 bg-white shadow-lg">
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText(s);
                  setOpen(false);
                }}
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-stone-950 hover:bg-stone-100"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
