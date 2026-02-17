import Link from "next/link";

/**
 * Blog card used in blogs grid and popular section.
 */
export default function BlogCard({ blog }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-36 bg-gradient-to-r from-amber-100 to-orange-100" />
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{blog.category}</p>
        <h3 className="mt-2 text-base font-semibold text-slate-900">{blog.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{blog.excerpt}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">{blog.readTime}</span>
          <Link href={blog.href} className="text-xs font-semibold text-amber-700 hover:text-amber-800">
            Read more
          </Link>
        </div>
      </div>
    </article>
  );
}
