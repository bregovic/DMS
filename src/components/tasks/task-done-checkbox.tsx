"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { setTaskStatus } from "@/server/actions/tasks";

// Rychlé označení úkolu jako hotového / nehotového.
// variant "button" = popsané tlačítko Hotovo / Vrátit (tam, kde je čtvereček
// vyhrazený pro výběr – aby se úkol neukončil omylem).
export function TaskDoneCheckbox({ id, done, variant = "box" }: { id: string; done: boolean; variant?: "box" | "button" }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={done ? "Označit jako nehotové" : "Označit jako hotové"}
      onClick={() => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("status", done ? "todo" : "done");
        start(async () => {
          try {
            await setTaskStatus(fd);
          } catch {
            window.alert("Změna se nezdařila.");
          }
        });
      }}
      className={
        variant === "button"
          ? `flex h-7 shrink-0 cursor-pointer items-center gap-1 border px-2 text-xs transition-colors disabled:opacity-50 ${
              done ? "border-stone-300 text-stone-500 hover:border-stone-950" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            }`
          : `mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors disabled:opacity-50 cursor-pointer ${
              done ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-transparent hover:border-stone-950"
            }`
      }
    >
      <Check className={variant === "button" ? "size-3.5" : "size-3.5"} />
      {variant === "button" && (done ? "Vrátit" : "Hotovo")}
    </button>
  );
}
