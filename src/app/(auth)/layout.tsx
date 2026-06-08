export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f3f0] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="display text-4xl tracking-tight text-stone-950">DMS</p>
          <p className="kicker mt-2">Výdaje &amp; dokumenty</p>
        </div>
        <div className="border border-stone-300/80 bg-white p-7">{children}</div>
        <p className="mt-6 text-center text-xs text-stone-400">
          Evidence projektů, výdajů a dokumentů
        </p>
      </div>
    </div>
  );
}
