/**
 * User testimonial card.
 */
export default function TestimonialCard({ item }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm leading-relaxed text-slate-700">&ldquo;{item.quote}&rdquo;</p>
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
        <p className="text-xs text-slate-500">{item.role}</p>
      </div>
    </article>
  );
}
