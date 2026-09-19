"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { CatalogAiProposal } from "@/components/catalog/catalog-ai-proposal";
import { setCatalogWishDone } from "@/server/actions/process-tables";

/**
 * Chybějící činnost → rovnou doplnit do katalogu: návrh úkonu s normou
 * práce a recepturou (ceny z webu); po uložení se poznámka označí doplněná.
 */
export function WishFill({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1 text-xs text-stone-700 underline-offset-4 hover:text-stone-950 hover:underline"
      >
        <Sparkles className="size-3.5" /> Doplnit
      </button>
    );
  return (
    <div className="mt-2 w-full">
      <CatalogAiProposal
        title={title}
        onSaved={async () => {
          const fd = new FormData();
          fd.set("id", id);
          fd.set("done", "1");
          await setCatalogWishDone(fd);
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
