"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useAutoFocus } from "@/components/ui/use-auto-focus";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, autoFocus, ...props }, ref) => {
  // autoFocus se nepředává do DOM – na dotyku se nefokusuje (viz useAutoFocus)
  const focusRef = useAutoFocus<HTMLInputElement>(autoFocus);
  return (
    <input
      type={type}
      ref={(el) => {
        focusRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={cn(
        "flex h-10 w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 transition-colors focus-visible:outline-none focus-visible:border-stone-950 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
