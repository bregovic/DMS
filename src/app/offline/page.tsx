import Link from "next/link";

export const metadata = { title: "Bez připojení – DMS" };

/**
 * Náhrada stránky, když zařízení není online. Service worker ji má
 * předem uloženou a podstrčí ji místo chybové stránky prohlížeče –
 * na stavbě signál občas není.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f3f0] px-6">
      <div className="max-w-sm">
        <p className="kicker">DMS</p>
        <h1 className="display mt-2 text-3xl text-stone-950">Bez připojení</h1>
        <p className="mt-3 text-sm text-stone-600">
          Data se načítají ze serveru, takže teď není co zobrazit. Fotky
          dokladů jde vyfotit i tak a nahrát je, až bude signál.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-11 items-center border border-stone-950 bg-stone-950 px-5 text-sm text-white transition-colors hover:bg-stone-800"
        >
          Zkusit znovu
        </Link>
      </div>
    </div>
  );
}
