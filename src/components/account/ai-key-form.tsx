"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAiKey } from "@/server/actions/account";
import { chybaAkce } from "@/lib/chyba-akce";

/**
 * Klíč k automatickému zpracování. Uloží se šifrovaně, zpátky se nečte –
 * jen se ukáže, že je zadaný.
 */
export function AiKeyForm({ keySet }: { keySet: boolean }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const run = (fd: FormData) => {
    setErr(null);
    start(async () => {
      try {
        await updateAiKey(fd);
        setKey("");
        router.refresh();
      } catch (e) {
        setErr(chybaAkce(e, "Uložení selhalo."));
      }
    });
  };

  return (
    <div className="max-w-xl">
      <label className="kicker mb-1 block" htmlFor="openaiApiKey">
        Klíč k API {keySet && <span className="text-emerald-700">· uložen</span>}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="openaiApiKey"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keySet ? "beze změny" : "sk-…"}
          className="h-10 min-w-0 flex-1 basis-64 rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-950 placeholder:text-stone-400 focus-visible:border-stone-950 focus-visible:outline-none"
        />
        <button
          type="button"
          disabled={busy || !key.trim()}
          onClick={() => {
            const fd = new FormData();
            fd.set("openaiApiKey", key.trim());
            run(fd);
          }}
          className="h-10 cursor-pointer border border-stone-950 bg-stone-950 px-4 text-sm text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
        >
          {busy ? "Ukládám…" : "Uložit"}
        </button>
        {keySet && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Smazat klíč? Automatické zpracování se tím pro tvůj účet vypne.")) return;
              const fd = new FormData();
              fd.set("clear", "1");
              run(fd);
            }}
            className="h-10 cursor-pointer border border-stone-300 px-3 text-sm text-stone-700 transition-colors hover:border-stone-950 disabled:opacity-60"
          >
            Smazat
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-stone-500">
        Bez klíče zpracování nejede. Doklady ve tvých projektech se čtou tvým klíčem, i když je nahrál dodavatel.
      </p>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}
