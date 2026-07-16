// Skeleton při navigaci uvnitř (app) sekce – dá zpětnou vazbu, než doběhnou dotazy.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse">
      <div className="mb-8 h-9 w-52 bg-stone-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 border border-stone-200 bg-white shadow-soft"
          />
        ))}
      </div>
      <div className="mt-10 space-y-px">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-stone-200" />
        ))}
      </div>
    </div>
  );
}
