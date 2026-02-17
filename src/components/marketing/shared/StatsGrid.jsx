/**
 * Generic stats grid used across pages.
 */
export default function StatsGrid({ stats = [] }) {
  if (!stats.length) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((item) => (
          <article key={`${item.label}-${item.value}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xl font-bold text-slate-900 sm:text-2xl">{item.value}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
