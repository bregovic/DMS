"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setItemClaim } from "@/server/actions/expenses";

/** Zaškrtnutí nároku u položky přímo v přehledu DPH. */
export function ClaimToggle({
  itemId,
  deductible,
  label,
  disabled = false,
}: {
  itemId: string;
  deductible: boolean;
  label: string;
  disabled?: boolean;
}) {
  const [busy, start] = useTransition();
  const router = useRouter();

  return (
    <input
      type="checkbox"
      checked={deductible}
      disabled={busy || disabled}
      aria-label={`V nároku: ${label}`}
      onChange={(e) => {
        const next = e.target.checked;
        start(async () => {
          const fd = new FormData();
          fd.set("itemId", itemId);
          fd.set("deductible", next ? "1" : "0");
          await setItemClaim(fd);
          router.refresh();
        });
      }}
      className="size-4 cursor-pointer accent-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
