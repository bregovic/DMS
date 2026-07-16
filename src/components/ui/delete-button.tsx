"use client";

import { Trash2 } from "lucide-react";

export function DeleteButton({
  action,
  fields,
  confirm = "Opravdu smazat?",
  className,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  confirm?: string;
  className?: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        title={label ?? "Smazat"}
        aria-label={label ?? "Smazat"}
        className={
          className ??
          "flex size-8 items-center justify-center rounded-none text-stone-400 transition-colors hover:bg-stone-950 hover:text-white cursor-pointer"
        }
      >
        <Trash2 className="size-4" />
        {label && <span className="ml-1 text-sm">{label}</span>}
      </button>
    </form>
  );
}
