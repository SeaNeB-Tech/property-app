import Link from "next/link";

/**
 * Property listing preview card for featured items.
 */
export default function ListingCard({ listing }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-44 bg-gradient-to-br from-slate-200 to-slate-300" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">{listing.title}</h3>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Verified</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{listing.location}</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{listing.price}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">{listing.type}</span>
          <Link href={listing.href} className="text-xs font-semibold text-cyan-700 hover:text-cyan-800">
            View details
          </Link>
        </div>
      </div>
    </article>
  );
}
