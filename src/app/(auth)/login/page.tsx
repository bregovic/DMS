import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/auth-forms";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Vítej zpět</h2>
        <p className="text-sm text-slate-500">Přihlas se do svého účtu</p>
      </div>
      <LoginForm />
    </div>
  );
}
