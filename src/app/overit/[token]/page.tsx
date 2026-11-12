import Link from "next/link";
import type { Metadata } from "next";
import { confirmVerification } from "@/server/email-verify";

export const metadata: Metadata = { title: "Ověření e-mailu – DMS", robots: { index: false } };

export default async function VerifyPage({ params }: PageProps<"/overit/[token]">) {
  const { token } = await params;
  const email = await confirmVerification(token);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f3f0] p-4">
      <div className="w-full max-w-sm border border-stone-300/80 bg-white p-7 text-center">
        <p className="kicker">DMS</p>
        <h1 className="display mt-2 text-2xl text-stone-950">{email ? "E-mail ověřen" : "Odkaz neplatí"}</h1>
        <p className="mt-3 text-sm text-stone-600">
          {email ? email : "Odkaz vypršel nebo už byl použit. Nový lze poslat po přihlášení."}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center bg-stone-950 px-5 text-sm font-medium text-white hover:bg-stone-800"
        >
          Pokračovat
        </Link>
      </div>
    </div>
  );
}
