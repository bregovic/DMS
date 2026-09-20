import { requireUser } from "@/lib/dal";
import { SettingsNav } from "@/components/account/settings-nav";
import { aiUsage } from "@/server/extraction";

/** Technické: automatické zpracování (útrata, limity, co je zapnuté). */
export default async function TechSettingsPage() {
  await requireUser();
  const u = await aiUsage();
  const usd = (v: number) => `${v.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  const bar = (v: number, max: number) => (
    <div className="mt-1 h-1.5 w-full bg-stone-100">
      <div className={`h-full ${v / max > 0.8 ? "bg-red-500" : "bg-stone-800"}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
    </div>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Nastavení</h1>
      </header>
      <SettingsNav />
      <section className="mt-8">
        <h2 className="kicker mb-4">Automatické zpracování – útrata a limity</h2>
        {!u.configured || u.limits.disabled ? (
          <p className="text-sm text-stone-500">Automatické zpracování je vypnuté.</p>
        ) : (
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-stone-700">
                Tento měsíc <span className="font-mono">{usd(u.month)}</span> z {usd(u.limits.monthlyUsd)}
              </p>
              {bar(u.month, u.limits.monthlyUsd)}
            </div>
            <div>
              <p className="text-sm text-stone-700">
                Dnes <span className="font-mono">{usd(u.today)}</span> z {usd(u.limits.dailyUsd)}
              </p>
              {bar(u.today, u.limits.dailyUsd)}
            </div>
            <p className="text-xs text-stone-500 sm:col-span-2">
              Nejvýš {u.limits.runsPerHour} spuštění za hodinu a {u.limits.parallel} najednou na uživatele, soubory do{" "}
              {Math.round(u.limits.maxFileBytes / 1048576)} MB, stejná příloha se nezpracovává dvakrát zároveň. Po dosažení
              limitu se zpracování do konce dne / měsíce nespustí – nic se nezaplatí navíc.
            </p>
          </div>
        )}
      </section>
      <section className="mt-12">
        <h2 className="kicker mb-2">Co zpracování umí</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
          <li>doklady: účtenka nebo faktura → dodavatel (ARES), částky, DPH, DUZP a položky</li>
          <li>nabídky: e-mail nebo PDF u žádanky → dodavatel a ceny, porovnání nabídek</li>
          <li>plán z dokumentace, odhad nákladů a návrh chybějících úkonů katalogu</li>
        </ul>
        <p className="mt-3 text-xs text-stone-400">
          Nic se nezakládá samo – vždy vznikne návrh k potvrzení. Limity se mění proměnnými prostředí na Railway.
        </p>
      </section>
    </div>
  );
}
