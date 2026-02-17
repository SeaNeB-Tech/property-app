import Link from "next/link";

/**
 * Call-to-action banner used in multiple pages.
 */
export default function CTASection({ title, description, primary, secondary }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="rounded-3xl bg-slate-900 p-8 text-white shadow-xl sm:p-10">
        <h3 className="text-2xl font-bold sm:text-3xl">{title}</h3>
        <p className="mt-3 max-w-2xl text-sm text-slate-200 sm:text-base">{description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={primary.href} className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
            {primary.label}
          </Link>
          {secondary ? (
            <Link href={secondary.href} className="rounded-full border border-slate-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-slate-300">
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
