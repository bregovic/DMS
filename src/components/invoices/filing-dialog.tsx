"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { previewFiling, sendFiling } from "@/server/actions/tax-filing";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Preview = Awaited<ReturnType<typeof previewFiling>>;

const EPO_URL = "https://adisspr.mfcr.cz/pmd/epo";

/**
 * Podání na finanční správu. Nejdřív se ukáže, co odejde (čísla podání, komu,
 * co chybí); pak jsou dvě cesty:
 *  - odeslat rovnou datovou schránkou (přihlášení je v nastavení),
 *  - stáhnout XML a otevřít EPO, kde se přihlásíš sám a soubor načteš.
 * Nikdy se neodesílá bez potvrzení.
 */
export function FilingDialog({
  kind,
  period,
  year,
  projectId,
  label,
}: {
  kind: "dp3" | "kh";
  period: string;
  year: number;
  projectId: string | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setData(null);
    setErr(null);
    setDone(null);
    previewFiling(kind, period, year, projectId)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Náhled se nepodařilo načíst."));
  }, [open, kind, period, year, projectId]);

  const info = data && !("error" in data) ? data : null;
  const ready = !!info && info.configured && !!info.recipient;
  const xmlUrl = `/api/export/${kind === "dp3" ? "dp3" : "kh"}?year=${year}&period=${period}${projectId ? `&project=${projectId}` : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 cursor-pointer items-center gap-2 border border-stone-300 px-3 text-xs uppercase tracking-wide text-stone-600 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
      >
        <Send className="size-3.5" /> {label}
      </button>

      {open && (
        <Dialog title="Podání datovou schránkou" size="lg" onClose={() => setOpen(false)}>
          <div className="space-y-4 p-5 text-sm">
            {!data && (
              <p className="flex items-center gap-2 text-stone-600">
                <Loader2 className="size-4 animate-spin" /> Připravuji podání…
              </p>
            )}
            {data && "error" in data && <p className="text-red-600">{data.error}</p>}
            {info && (
              <>
                <div>
                  <p className="font-medium text-stone-950">
                    {info.label} za {info.periodLabel}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-stone-600">
                    {info.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>

                <dl className="grid grid-cols-[8rem_1fr] gap-y-1 border-t border-stone-200 pt-3 text-stone-600">
                  <dt className="text-stone-400">Odesílatel</dt>
                  <dd>{info.dic ?? "— doplň DIČ v nastavení —"}</dd>
                  <dt className="text-stone-400">Schránka FÚ</dt>
                  <dd>{info.recipient ?? "— doplň v Nastavení → Fakturace a daně —"}</dd>
                  <dt className="text-stone-400">Režim</dt>
                  <dd>{info.mode === "test" ? "veřejný test datových schránek" : "ostrý provoz"}</dd>
                </dl>

                {info.missing.length > 0 && (
                  <div className="border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-medium">Před odesláním zkontroluj:</p>
                    <ul className="mt-1 list-disc pl-4">
                      {info.missing.slice(0, 8).map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {info.sent && !done && (
                  <p className="text-xs text-stone-500">
                    Za tohle období už jednou odešlo podání {new Date(info.sent.sentAt).toLocaleString("cs-CZ")} (zpráva
                    č. {info.sent.messageId}). Další odeslání bude opravné/následné podání.
                  </p>
                )}
                {!info.configured && (
                  <p className="text-xs text-amber-700">
                    Datová schránka není propojená – doplň přihlášení v Nastavení → Fakturace a daně. Podat můžeš i tak:
                    stáhni XML a načti ho v EPO.
                  </p>
                )}
                {done && <p className="text-emerald-700">Odesláno. Číslo datové zprávy: {done}</p>}
                {err && <p className="text-red-600">{err}</p>}
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {done ? "Zavřít" : "Zrušit"}
            </Button>
            {!done && (
              <a
                href={xmlUrl}
                onClick={() => setTimeout(() => window.open(EPO_URL, "_blank", "noopener"), 300)}
                className="inline-flex h-10 cursor-pointer items-center border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950"
              >
                Stáhnout XML a otevřít EPO
              </a>
            )}
            {!done && (
              <Button
                type="button"
                disabled={!ready || busy}
                onClick={async () => {
                  if (!window.confirm("Opravdu odeslat podání na finanční úřad? Odeslání nejde vzít zpět.")) return;
                  setBusy(true);
                  setErr(null);
                  const res = await sendFiling(kind, period, year, projectId);
                  setBusy(false);
                  if ("error" in res) setErr(res.error ?? "Odeslání selhalo.");
                  else {
                    setDone(res.messageId ?? "");
                    router.refresh();
                  }
                }}
              >
                {busy ? "Odesílám…" : "Odeslat datovkou"}
              </Button>
            )}
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
}
