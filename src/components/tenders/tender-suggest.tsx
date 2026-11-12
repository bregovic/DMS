"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  addSuggestedVendors,
  startTenderSuggest,
} from "@/server/actions/tenders";

const field =
  "flex w-full rounded-none border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none";
const lbl = "kicker mb-1.5 block";
const btn =
  "inline-flex h-9 items-center gap-1.5 bg-stone-950 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 cursor-pointer";
const btnOutline =
  "inline-flex h-9 items-center gap-1.5 border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:border-stone-950 hover:text-stone-950 disabled:opacity-50 cursor-pointer";

export type SuggestionView = {
  requests: {
    requestId: string;
    title: string;
    offerFields: { label: string; unit: string | null; required: boolean }[];
    gaps: string[];
  }[];
  criteria: { label: string; weight: number; note: string }[];
  vendors: {
    name: string;
    ico: string | null;
    web: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    rating: number | null;
    ratingCount: number | null;
    ratingSource: string | null;
    references: string | null;
    why: string;
    aresName: string | null;
    aresOk: boolean;
    vendorId: string | null;
    invited: boolean;
    forRequests: string[];
  }[];
  note: string | null;
};

/** Návrh údajů k vyplnění, kritérií a dodavatelů z webu (#49). */
export function TenderSuggest({
  tenderId,
  status,
  error,
  prompt,
  result,
}: {
  tenderId: string;
  status: "idle" | "running" | "ready" | "error";
  error: string | null;
  prompt: string | null;
  result: SuggestionView | null;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  function start(fd: FormData) {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await startTenderSuggest(fd);
        if (r.error) setMsg(r.error);
      } catch {
        setMsg("Návrh se nepodařilo spustit. Načti stránku znovu.");
      }
    });
  }

  function addVendors() {
    const fd = new FormData();
    fd.set("id", tenderId);
    for (const i of picked) fd.append("pick", String(i));
    startTransition(async () => {
      try {
        const r = await addSuggestedVendors(fd);
        if (r.error) setMsg(r.error);
        else {
          setMsg(`Přidáno mezi oslovené: ${r.added ?? 0}.`);
          setPicked(new Set());
        }
      } catch {
        setMsg("Uložení se nepovedlo. Načti stránku znovu.");
      }
    });
  }

  const running = status === "running";
  return (
    <div className="space-y-6">
      <form action={start} className="space-y-2">
        <input type="hidden" name="id" value={tenderId} />
        <label className={lbl}>Upřesnění</label>
        <textarea
          name="prompt"
          rows={2}
          defaultValue={prompt ?? ""}
          placeholder="např. do 40 km, stříkaná PUR pěna s otevřenou buňkou, realizace na jaře"
          className={field}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending || running} className={btn}>
            {(pending || running) && <Loader2 className="size-4 animate-spin" />}
            {running ? "Hledám dodavatele…" : result ? "Navrhnout znovu" : "Navrhnout dodavatele a kritéria"}
          </button>
          {running && <span className="text-xs text-stone-500">Trvá to několik minut.</span>}
          {status === "error" && error && <span className="text-xs text-red-700">{error}</span>}
          {msg && <span className="text-xs text-stone-600">{msg}</span>}
        </div>
      </form>

      {result && !running && (
        <>
          {result.note && <p className="border-l-2 border-stone-300 pl-3 text-sm text-stone-600">{result.note}</p>}

          {result.vendors.length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="kicker">Navržení dodavatelé · {result.vendors.length}</p>
                <button type="button" onClick={addVendors} disabled={pending || picked.size === 0} className={btn}>
                  Oslovit vybrané{picked.size ? ` (${picked.size})` : ""}
                </button>
              </div>
              <ul className="border-t border-stone-200">
                {result.vendors.map((v, i) => (
                  <li key={i} className={`border-b border-stone-200 py-2.5 ${v.invited ? "opacity-50" : ""}`}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        disabled={v.invited}
                        checked={picked.has(i)}
                        onChange={(e) => {
                          const n = new Set(picked);
                          if (e.target.checked) n.add(i);
                          else n.delete(i);
                          setPicked(n);
                        }}
                        className="mt-1 size-4 accent-stone-950"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium text-stone-950">{v.aresName || v.name}</span>
                          {v.city && <span className="text-xs text-stone-500">{v.city}</span>}
                          {v.rating != null ? (
                            <span className="border border-stone-950 px-1.5 text-xs font-medium text-stone-950">
                              ★ {v.rating.toLocaleString("cs-CZ")}
                              <span className="font-normal text-stone-500">
                                {v.ratingCount ? ` · ${v.ratingCount} recenzí` : ""}
                                {v.ratingSource ? ` · ${v.ratingSource}` : ""}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">bez hodnocení</span>
                          )}
                          {v.invited ? (
                            <span className="text-[10px] uppercase tracking-wide text-stone-500">osloven</span>
                          ) : v.vendorId ? (
                            <span className="text-[10px] uppercase tracking-wide text-stone-500">v evidenci</span>
                          ) : null}
                          {!v.aresOk && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-700">IČO neověřeno</span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-600">
                          {[v.email ?? "bez e-mailu", v.phone, v.ico ? `IČO ${v.ico}` : null].filter(Boolean).join(" · ")}
                          {v.web && (
                            <>
                              {" · "}
                              <a
                                href={v.web}
                                target="_blank"
                                rel="noreferrer"
                                className="underline-offset-2 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                web
                              </a>
                            </>
                          )}
                        </span>
                        {v.references && <span className="mt-0.5 block text-xs text-stone-500">{v.references}</span>}
                        <span className="mt-0.5 block text-xs text-stone-500">
                          {v.why}
                          {v.forRequests.length > 0 && v.forRequests.length < result.requests.length
                            ? ` · ${v.forRequests.join(", ")}`
                            : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.requests.map((r) => (
            <div key={r.requestId}>
              {r.gaps.length > 0 && (
                <div className="mt-2 text-xs text-stone-600">
                  <p className="font-medium text-stone-700">V zadání chybí · {r.title}</p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {r.gaps.map((g, k) => (
                      <li key={k}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
