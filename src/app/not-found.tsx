import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <p className="kicker">404</p>
      <h1 className="display mt-2 text-3xl text-stone-950">Stránka nenalezena</h1>
      <p className="mt-3 text-sm text-stone-500">
        Tady nic není. Zkontroluj adresu, nebo se vrať na přehled.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-none border border-stone-950 bg-stone-950 px-5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
      >
        Na přehled
      </Link>
    </div>
  );
}
