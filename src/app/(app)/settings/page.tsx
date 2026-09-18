import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { InstallButton } from "@/components/app/install-button";
import { CodelistManager } from "@/components/account/codelist-manager";
import { VendorAvailabilityDialog } from "@/components/vendors/vendor-availability-dialog";
import { aiUsage } from "@/server/extraction";

export default async function SettingsPage() {
  const user = await requireUser();
  const [
    dbUser,
    projTypes,
    expCats,
    docTypes,
    reqStatuses,
    offerStatuses,
    expStatuses,
    taskStatuses,
  ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      }),
      prisma.projectType.findMany({
        orderBy: { label: "asc" },
        select: { id: true, label: true },
      }),
      prisma.expenseCategory.findMany({
        orderBy: { label: "asc" },
        select: { id: true, label: true },
      }),
      prisma.documentType.findMany({
        orderBy: { label: "asc" },
        select: { id: true, label: true },
      }),
      prisma.statusOption.findMany({
        where: { scope: "request" },
        orderBy: [{ sort: "asc" }, { label: "asc" }],
        select: { id: true, label: true },
      }),
      prisma.statusOption.findMany({
        where: { scope: "offer" },
        orderBy: [{ sort: "asc" }, { label: "asc" }],
        select: { id: true, label: true },
      }),
      prisma.statusOption.findMany({
        where: { scope: "expense" },
        orderBy: [{ sort: "asc" }, { label: "asc" }],
        select: { id: true, label: true },
      }),
      prisma.statusOption.findMany({
        where: { scope: "task" },
        orderBy: [{ sort: "asc" }, { label: "asc" }],
        select: { id: true, label: true },
      }),
    ]);
  const hasPassword = Boolean(dbUser?.passwordHash);

  // Dodavatelé navázaní na e-mail uživatele (uživatel je zároveň dodavatelem)
  const myVendors = user.email
    ? await prisma.vendor.findMany({
        where: { email: { equals: user.email, mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          ownerId: true,
          owner: { select: { name: true, email: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 border-b border-stone-300/80 pb-6">
        <h1 className="display text-4xl text-stone-950">Nastavení</h1>
        <p className="mt-2 text-sm text-stone-500">{user.email}</p>
      </header>

      <section>
        <h2 className="kicker mb-4">
          {hasPassword ? "Změna hesla" : "Nastavení hesla"}
        </h2>
        {!hasPassword && (
          <p className="mb-4 max-w-sm text-sm text-stone-500">
            Účet zatím nemá heslo (přihlašuješ se přes Google). Můžeš si nastavit
            heslo pro přihlášení e-mailem.
          </p>
        )}
        <ChangePasswordForm hasPassword={hasPassword} />
      </section>

      <AiUsageSection />

      <section className="mt-12">
        <h2 className="kicker mb-4">Mobilní aplikace</h2>
        <InstallButton />
      </section>

      <section className="mt-12">
        <h2 className="kicker mb-2">Číselníky (vlastní položky)</h2>
        <p className="mb-5 max-w-lg text-sm text-stone-500">
          Přidej, přejmenuj nebo smaž vlastní typy, kategorie a stavy. Vestavěné
          jsou pevné a v seznamu se nezobrazují. Smazat lze jen položku, která se
          nikde nepoužívá.
        </p>
        <CodelistManager
          groups={[
            { kind: "projectType", title: "Typy projektů", items: projTypes },
            {
              kind: "expenseCategory",
              title: "Kategorie výdajů",
              items: expCats,
            },
            { kind: "documentType", title: "Typy dokumentů", items: docTypes },
            {
              kind: "requestStatus",
              title: "Stavy žádanek",
              items: reqStatuses,
            },
            { kind: "offerStatus", title: "Stavy nabídek", items: offerStatuses },
            { kind: "expenseStatus", title: "Stavy výdajů", items: expStatuses },
            { kind: "taskStatus", title: "Stavy úkolů", items: taskStatuses },
          ]}
        />
      </section>

      {myVendors.length > 0 && (
        <section className="mt-12">
          <h2 className="kicker mb-2">Moje dostupnost (jako dodavatel)</h2>
          <p className="mb-5 max-w-lg text-sm text-stone-500">
            Jsi v systému veden jako dodavatel (podle e-mailu). Tady si můžeš
            spravovat kalendář své dostupnosti — projeví se při plánování úkolů,
            které ti někdo přiřadí.
          </p>
          <ul className="border-t border-stone-200">
            {myVendors.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 border-b border-stone-200 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-950">{v.name}</p>
                  {v.ownerId !== user.id && (
                    <p className="kicker mt-0.5">
                      eviduje {v.owner.name ?? v.owner.email ?? "?"}
                    </p>
                  )}
                </div>
                <VendorAvailabilityDialog vendorId={v.id} vendorName={v.name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Útrata za AI a pojistky (limity se mění proměnnými prostředí na Railway). */
async function AiUsageSection() {
  const u = await aiUsage();
  const usd = (v: number) => `${v.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  const bar = (v: number, max: number) => (
    <div className="mt-1 h-1.5 w-full bg-stone-100">
      <div className={`h-full ${v / max > 0.8 ? "bg-red-500" : "bg-stone-800"}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
    </div>
  );
  return (
    <section className="mt-12">
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
  );
}
