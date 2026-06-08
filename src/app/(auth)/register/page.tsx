import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RegisterForm } from "@/components/auth/auth-forms";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div>
      <div className="mb-6">
        <h2 className="display text-2xl text-stone-950">Vytvoř si účet</h2>
        <p className="mt-1 text-sm text-stone-500">Začni spravovat své projekty</p>
      </div>
      <RegisterForm />
    </div>
  );
}
