"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { setTaskStatus } from "@/server/actions/tasks";

// Rychlé označení úkolu jako hotového / nehotového.
export function TaskDoneCheckbox({ id, done }: { id: string; done: boolean }) {
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
      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors disabled:opacity-50 cursor-pointer ${
        done
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 text-transparent hover:border-stone-950"
      }`}
    >
      <Check className="size-3.5" />
    </button>
  );
}
