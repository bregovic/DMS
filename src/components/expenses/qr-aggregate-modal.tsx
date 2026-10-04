"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

import {
  aggregateExpensesQr,
  settlePaymentWithOffsets,
  type QrGroup,
} from "@/server/actions/qr-aggregate";
import { formatCurrency } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";

/**
 * Uložení QR z dialogu. Na telefonu nejde oskenovat vlastní displej, takže
 * se kód uloží nebo pošle rovnou do bankovnictví; QR už je hotový obrázek,
 * jen se z data URL udělá soubor.
 */
async function ulozitQr(qr: string, nazev: string) {
  const blob = await (await fetch(qr)).blob();
  const file = new File([blob], nazev, { type: "image/png" });
  // Sdílení je na telefonu lepší než stahování – nabídne Uložit do fotek
  // i poslání do jiné aplikace. Na počítači se soubor jen stáhne.
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: nazev });
    } catch {
      // uživatel sdílení zavřel – nic dalšího neřešíme
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nazev;
  a.click();
  URL.revokeObjectURL(url);
}

export function QrAggregateModal({
  projectId,
  ids,
  onClose,
}: {
  /** prázdné = výdaje z více projektů (modul Platby) */
  projectId: string;
  ids: string[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<QrGroup[]>([]);
  const [skippedPaid, setSkippedPaid] = useState(0);
  const [skippedNoBank, setSkippedNoBank] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  /** Zaškrtnuté zápočty: id příjmu → kolik použít. */
  const [zapocty, setZapocty] = useState<Record<string, number>>({});
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await aggregateExpensesQr(
          projectId || null,
          ids,
          Object.entries(zapocty).map(([incomeId, amount]) => ({ incomeId, amount })),
        );
        if (!alive) return;
        if ("error" in res) {
          setError(res.error);
        } else {
          setGroups(res.groups);
          setSkippedPaid(res.skippedPaid);
          setSkippedNoBank(res.skippedNoBank);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "QR se nepodařilo vytvořit.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // QR nese částku, takže se po změně zápočtu musí vyrobit znovu.
  }, [projectId, ids, zapocty]);

  return (
    <Dialog title="QR platba" size="lg" onClose={onClose}>
        <div className="px-5 py-4">
          {loading ? (
            <p className="py-12 text-center text-sm text-stone-500">
              Vytvářím QR platby…
            </p>
          ) : error ? (
            <p className="py-12 text-center text-sm text-red-600">{error}</p>
          ) : (
            <div className="space-y-6">
              {groups.length > 1 && (
                <p className="text-xs text-stone-500">
                  Vybrané výdaje míří na {groups.length} různých účtů – níže je QR
                  pro každý účet zvlášť.
                </p>
              )}
              {groups.map((g, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  {g.qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.qr} alt={`QR platba ${g.vendorName}`} className="size-56" />
                  ) : (
                    <p className="flex size-56 items-center justify-center border border-dashed border-stone-300 px-4 text-sm text-stone-500">
                      Zápočtem vyrovnáno, není co platit.
                    </p>
                  )}
                  <p className="mt-2 font-mono text-lg text-stone-950">
                    {formatCurrency(g.amount, g.currency)}
                  </p>
                  <p className="text-sm font-medium text-stone-950">
                    {g.vendorName}
                  </p>
                  <p className="kicker mt-0.5">
                    {g.accountLabel}
                    {g.vs ? ` · VS ${g.vs}` : ""} ·{" "}
                    {g.count === 1 ? "1 výdaj" : `${g.count} výdajů`}
                  </p>
                  {g.qr && (
                    <button
                      type="button"
                      onClick={() =>
                        ulozitQr(
                          g.qr,
                          `qr-${g.vendorName.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${Math.round(g.amount)}.png`,
                        )
                      }
                      className="mt-2 flex h-9 cursor-pointer items-center gap-1.5 border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
                    >
                      <Download className="size-4" /> Uložit QR
                    </button>
                  )}
                  {g.count > 1 && (
                    <p className="mt-1 max-w-xs text-[11px] leading-snug text-stone-400">
                      {g.titles.join(", ")}
                    </p>
                  )}
                  {/* Dodavatel má nezapočtené příjmy (půjčka, vratka) – jde je
                      odečíst od toho, co se mu teď platí. */}
                  {(g.candidates.length > 0 || g.offsets.length > 0) && (
                    <div className="mt-3 w-full max-w-sm border border-stone-200 p-3 text-left">
                      <p className="kicker mb-1.5">Zápočet</p>
                      {g.offsets.length > 0 && (
                        <ul className="mb-1.5 space-y-1">
                          {g.offsets.map((o) => (
                            <li key={o.id} className="flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked
                                onChange={() =>
                                  setZapocty((z) =>
                                    Object.fromEntries(Object.entries(z).filter(([k]) => k !== o.id)),
                                  )
                                }
                                className="mt-0.5 size-4 cursor-pointer accent-stone-900"
                              />
                              <span className="min-w-0 flex-1">
                                {o.title}
                                <span className="block text-[11px] text-stone-400">
                                  započteno {formatCurrency(o.amount, g.currency)}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {g.candidates.map((c) => (
                        <label key={c.id} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm">
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => setZapocty((z) => ({ ...z, [c.id]: c.available }))}
                            className="mt-0.5 size-4 accent-stone-900"
                          />
                          <span className="min-w-0 flex-1">
                            {c.title}
                            <span className="block text-[11px] text-stone-400">
                              {c.project} · {c.date} · k zápočtu {formatCurrency(c.available, c.currency)}
                            </span>
                          </span>
                        </label>
                      ))}
                      {g.offsets.length > 0 && (
                        <p className="mt-2 border-t border-stone-200 pt-2 text-xs text-stone-600">
                          Výdaje {formatCurrency(g.gross, g.currency)} − zápočet{" "}
                          {formatCurrency(g.gross - g.amount, g.currency)} ={" "}
                          <b className="text-stone-950">{formatCurrency(g.amount, g.currency)}</b>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {(skippedPaid > 0 || skippedNoBank.length > 0) && (
                <div className="border-t border-stone-200 pt-3 text-xs text-stone-500">
                  {skippedPaid > 0 && (
                    <p>Vynecháno {skippedPaid} už uhrazených.</p>
                  )}
                  {skippedNoBank.length > 0 && (
                    <p>
                      Bez bankovního účtu (nezahrnuto):{" "}
                      {skippedNoBank.join(", ")}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {!loading && !error && groups.length > 0 && (
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-stone-200 bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 text-sm text-stone-500 transition-colors hover:text-stone-950 cursor-pointer"
            >
              Zavřít
            </button>
            <button
              type="button"
              disabled={paying}
              onClick={async () => {
                const ids = groups.flatMap((g) => g.ids);
                if (ids.length === 0) return;
                // Pojistka: zelené tlačítko je hned vedle „Zavřít“ a označí
                // všechny výdaje v okně – ať to nejde odkliknout omylem.
                const sum = groups.reduce((a, g) => a + g.amount, 0);
                const zap = groups.reduce((a, g) => a + g.offsets.reduce((b, o) => b + o.amount, 0), 0);
                const kc = (v: number) => `${Math.round(v).toLocaleString("cs-CZ")} Kč`;
                const otazka = [
                  `Označit ${ids.length} ${ids.length === 1 ? "výdaj" : ids.length < 5 ? "výdaje" : "výdajů"} jako uhrazené?`,
                  "",
                  zap > 0 ? `Zaplaceno ${kc(sum)}, zápočtem vyrovnáno ${kc(zap)}.` : `Zaplaceno ${kc(sum)}.`,
                  "",
                  "QR kód si můžeš zobrazit i bez toho – stačí okno zavřít.",
                ].join(String.fromCharCode(10));
                if (!window.confirm(otazka)) return;
                setPaying(true);
                try {
                  // Výdaje i zápočty jednou akcí – označit uhrazené bez
                  // spotřebování zápočtu by znamenalo přeplatek příště.
                  const pouzite = groups.flatMap((g) =>
                    g.offsets.map((o) => ({ incomeId: o.id, amount: o.amount, vendorId: g.vendorId })),
                  );
                  const res = await settlePaymentWithOffsets(ids, pouzite);
                  if ("error" in res) {
                    setError(res.error);
                    setPaying(false);
                    return;
                  }
                  router.refresh();
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Nepodařilo se označit jako uhrazené.");
                  setPaying(false);
                }
              }}
              className="h-9 cursor-pointer border border-emerald-600 px-4 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white disabled:opacity-50"
            >
              {paying ? "Ukládám…" : "Zaplaceno – označit jako uhrazené"}
            </button>
          </div>
        )}
    </Dialog>
  );
}
