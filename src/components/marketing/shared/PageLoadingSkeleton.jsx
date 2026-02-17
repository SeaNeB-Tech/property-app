/**
 * Simple page-level skeleton used in route loading states.
 */
export default function PageLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" aria-busy="true">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-4 h-5 w-80 animate-pulse rounded bg-slate-200" />
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, idx) => (
          <div key={idx} className="h-40 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
