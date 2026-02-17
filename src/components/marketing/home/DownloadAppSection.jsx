import Link from "next/link";

/**
 * Prominent app download banner for mobile app acquisition.
 */
export default function DownloadAppSection({ section }) {
  if (!section) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-900 to-cyan-900 p-8 text-white shadow-2xl sm:p-10">
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-6 h-64 w-64 rounded-full bg-indigo-300/10 blur-3xl" />

        <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
          <div className="relative hidden h-64 lg:block">
            <div className="absolute left-2 top-10 h-52 w-28 rotate-[-10deg] rounded-[24px] border border-white/40 bg-slate-900/80 shadow-xl" />
            <div className="absolute left-24 top-0 h-64 w-32 rounded-[28px] border border-white/50 bg-white/90 shadow-2xl">
              <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-300" />
              <div className="mt-5 px-3">
                <div className="h-8 rounded-lg bg-rose-100" />
                <div className="mt-3 h-16 rounded-xl bg-cyan-100" />
                <div className="mt-3 h-16 rounded-xl bg-slate-100" />
                <div className="mt-3 h-16 rounded-xl bg-amber-100" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-3xl font-bold leading-tight sm:text-4xl">{section.title}</h3>
            <p className="mt-3 text-sm text-cyan-100 sm:text-lg">{section.description}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={section.appStoreHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-cyan-200/30 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Download on App Store
              </Link>
              <Link
                href={section.playStoreHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-cyan-200/30 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Get it on Google Play
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
