"use client";

// Chybová hranice pro (app) sekce – editorial „něco se pokazilo" + retry.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl py-24 text-center">
      <p className="kicker">Chyba</p>
      <h1 className="display mt-2 text-3xl text-stone-950">Něco se pokazilo</h1>
      <p className="mt-3 text-sm text-stone-500">
        Akci se nepodařilo dokončit. Zkus to prosím znovu; pokud problém
        přetrvává, obnov stránku.
      </p>
      {error?.message && (
        <p className="mt-2 font-mono text-xs text-stone-400">{error.message}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-10 items-center rounded-none border border-stone-950 bg-stone-950 px-5 text-sm font-medium text-white transition-colors hover:bg-stone-800 cursor-pointer"
      >
        Zkusit znovu
      </button>
    </div>
  );
}
