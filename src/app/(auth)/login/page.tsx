import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/auth-forms";
import { InstallHint } from "@/components/app/install-hint";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div>
      <div className="mb-6">
        <h2 className="display text-2xl text-stone-950">Vítej zpět</h2>
        <p className="mt-1 text-sm text-stone-500">Přihlas se do svého účtu</p>
      </div>
      <LoginForm />
      <InstallHint />
    </div>
  );
}
