"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocScanReview } from "@/components/expenses/doc-scan-review";

export type QueueScan = {
  id: string;
  documentId: string;
  projectId: string;
  originalName: string;
};

/**
 * Kontrola přečtených dokladů za sebou: otevře první, po vyřízení hned další.
 * Zavřením dialogu fronta končí – zbytek zůstane v seznamu.
 */
export function DocScanQueue({
  scans,
  categories,
}: {
  scans: QueueScan[];
  categories: { key: string; label: string }[];
}) {
  /* Fronta se při spuštění zmrazí. Potvrzení dokladu překreslí stránku a ze
     seznamu ho odebere – kdyby se chodilo po živém seznamu, každý další doklad
     by se posunul o jedna a jeden by se pokaždé přeskočil. */
  const [fronta, setFronta] = useState<QueueScan[] | null>(null);
  const [index, setIndex] = useState(0);
  if (scans.length === 0) return null;

  const aktualni = fronta && index < fronta.length ? fronta[index] : null;

  const konec = () => {
    setFronta(null);
    setIndex(0);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setFronta(scans);
          setIndex(0);
        }}
      >
        <ClipboardCheck className="size-4" /> Kontrola · {scans.length}
      </Button>
      {aktualni && (
        <DocScanReview
          // Nový klíč = nový dialog se svým stavem, jinak by v dalším dokladu
          // zůstaly údaje z předchozího.
          key={aktualni.id}
          scanId={aktualni.id}
          documentId={aktualni.documentId}
          projectId={aktualni.projectId}
          categories={categories}
          autoOpen
          hideButton
          onDone={(vysledek) => {
            if (vysledek === "close") {
              konec();
              return;
            }
            if (index + 1 < (fronta?.length ?? 0)) setIndex(index + 1);
            else konec();
          }}
        />
      )}
    </>
  );
}
