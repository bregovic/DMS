import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { InstallButton } from "@/components/app/install-button";
import { CodelistManager } from "@/components/account/codelist-manager";

export default async function SettingsPage() {
  const user = await requireUser();
  const [dbUser, projTypes, expCats, docTypes] = await Promise.all([
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
  ]);
  const hasPassword = Boolean(dbUser?.passwordHash);

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

      <section className="mt-12">
        <h2 className="kicker mb-4">Mobilní aplikace</h2>
        <InstallButton />
      </section>

      <section className="mt-12">
        <h2 className="kicker mb-2">Číselníky (vlastní položky)</h2>
        <p className="mb-5 max-w-lg text-sm text-stone-500">
          Přejmenuj nebo smaž vlastní typy a kategorie. Vestavěné jsou pevné.
          Smazat lze jen položku, která se nikde nepoužívá.
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
          ]}
        />
      </section>
    </div>
  );
}
