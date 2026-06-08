import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Ověří přihlášeného uživatele. Pokud není přihlášen, přesměruje na /login.
 * Vrací bezpečné info o uživateli pro server komponenty a akce.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
}
