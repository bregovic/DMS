import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
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
    </div>
  );
}
