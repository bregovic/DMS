import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RegisterForm } from "@/components/auth/auth-forms";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Vytvoř si účet</h2>
        <p className="text-sm text-slate-500">Začni spravovat své projekty</p>
      </div>
      <RegisterForm />
    </div>
  );
}
