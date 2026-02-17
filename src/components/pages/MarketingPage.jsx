"use client";

import Link from "next/link";
import MainNavbar from "@/components/ui/MainNavbar";
import pageData from "@/constants/navbarPages.json";

function findPage(pageKey) {
  return pageData.find((page) => page.key === pageKey);
}

function renderStats(stats, accentClass = "text-slate-900") {
  if (!stats?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={`${item.label}-${item.value}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className={`text-base font-bold sm:text-lg ${accentClass}`}>Coming ...</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function renderFeatureCards(cards, buttonClass = "bg-slate-900 text-white hover:bg-slate-800") {
  if (!cards?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-slate-900">Key features</h2>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{card.description}</p>
            {card.href ? (
              <Link href={card.href} className={`mt-4 inline-block rounded-full px-4 py-2 text-xs font-semibold transition ${buttonClass}`}>
                Learn more
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function renderProcess(process) {
  if (!process?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-slate-900">How it works</h2>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {process.map((step, index) => (
          <div key={step} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {index + 1}
            </span>
            <p className="text-sm leading-relaxed text-slate-700">{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function renderFeaturedPosts(posts) {
  if (!posts?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-slate-900">Featured reads</h2>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {posts.map((post) => (
          <article key={post.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">{post.title}</h3>
            <p className="mt-2 text-sm text-slate-700">{post.description}</p>
            <Link href={post.href || "/blogs"} className="mt-4 inline-block text-xs font-semibold text-amber-700 hover:text-amber-800">
              Read article
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderContactChannels(channels) {
  if (!channels?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-slate-900">Choose a support path</h2>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {channels.map((channel) => (
          <article key={channel.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">{channel.title}</h3>
            <p className="mt-2 text-sm text-slate-700">{channel.description}</p>
            <Link href={channel.href || "/contact"} className="mt-4 inline-block text-xs font-semibold text-indigo-700 hover:text-indigo-800">
              Continue
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function MarketingPage({ pageKey }) {
  const page = findPage(pageKey);

  if (!page) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <MainNavbar />
        <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold">Page not found</h1>
        </section>
      </div>
    );
  }

  const sectionCards = page.sections.map((section) => (
    <article key={section.heading} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">{section.heading}</h2>
      <ul className="mt-4 space-y-3">
        {section.items.map((item) => (
          <li key={item} className="text-sm leading-relaxed text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </article>
  ));

  const faqList = (
    <div className="mt-5 space-y-4">
      {page.faq.map((item) => (
        <article key={item.question} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">{item.question}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.answer}</p>
        </article>
      ))}
    </div>
  );

  const ctaBlock = (
    <div className="rounded-3xl bg-slate-900 p-8 text-white sm:p-10">
      <h2 className="text-2xl font-bold">Ready to continue?</h2>
      <p className="mt-2 text-sm text-slate-200">Take the next step from this page.</p>
      <Link
        href={page.cta.href}
        className="mt-5 inline-block rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
      >
        {page.cta.label}
      </Link>
    </div>
  );

  if (page.key === "about") {
    return (
      <div className="min-h-screen bg-rose-50 text-slate-900">
        <MainNavbar />
        <section className="bg-gradient-to-r from-rose-900 via-rose-800 to-orange-700 text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">Who We Are</p>
            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{page.title}</h1>
            <p className="mt-4 max-w-3xl text-base text-rose-100 sm:text-lg">{page.subtitle}</p>
          </div>
        </section>
        {renderStats(page.stats, "text-rose-700")}
        <section className="mx-auto max-w-6xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
            <p className="text-lg leading-relaxed text-slate-700">{page.intro}</p>
          </div>
        </section>
        {renderFeatureCards(page.featureCards, "bg-rose-700 text-white hover:bg-rose-600")}
        {renderProcess(page.process)}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-2 lg:px-8">
          {sectionCards}
        </section>
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          {faqList}
        </section>
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">{ctaBlock}</section>
      </div>
    );
  }

  if (page.key === "solution") {
    return (
      <div className="min-h-screen bg-emerald-50 text-slate-900">
        <MainNavbar />
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-16">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-900 to-teal-800 p-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Solutions</p>
            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{page.title}</h1>
            <p className="mt-4 text-base text-emerald-100">{page.subtitle}</p>
            <p className="mt-6 text-sm leading-relaxed text-emerald-100">{page.intro}</p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Built for local growth</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Find the right workflow for seekers and property businesses with focused discovery paths and operational tools.
            </p>
            <div className="mt-6 space-y-3">
              {page.sections[0]?.items?.slice(0, 3).map((item) => (
                <p key={item} className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-slate-700">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </section>
        {renderStats(page.stats, "text-emerald-700")}
        {renderFeatureCards(page.featureCards, "bg-emerald-700 text-white hover:bg-emerald-600")}
        {renderProcess(page.process)}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-2 lg:px-8">
          {sectionCards}
        </section>
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          {faqList}
        </section>
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">{ctaBlock}</section>
      </div>
    );
  }

  if (page.key === "blogs") {
    return (
      <div className="min-h-screen bg-amber-50 text-slate-900">
        <MainNavbar />
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Newsroom</p>
            <h1 className="mt-3 text-4xl font-bold text-slate-900 sm:text-5xl">{page.title}</h1>
            <p className="mt-4 text-base text-slate-700 sm:text-lg">{page.subtitle}</p>
            <p className="mt-5 text-sm leading-relaxed text-slate-700">{page.intro}</p>
          </div>
        </section>
        {renderStats(page.stats, "text-amber-700")}
        {renderFeaturedPosts(page.featuredPosts)}
        {renderFeatureCards(page.featureCards, "bg-amber-700 text-white hover:bg-amber-600")}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-3 lg:px-8">
          {page.sections.map((section) => (
            <article key={section.heading} className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{section.heading}</h2>
              <ul className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <li key={item} className="text-sm text-slate-700">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          {faqList}
        </section>
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">{ctaBlock}</section>
      </div>
    );
  }

  if (page.key === "partner") {
    return (
      <div className="min-h-screen bg-sky-50 text-slate-900">
        <MainNavbar />
        <section className="bg-gradient-to-r from-sky-900 via-blue-800 to-cyan-700 text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Partnership</p>
            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{page.title}</h1>
            <p className="mt-4 max-w-3xl text-base text-sky-100 sm:text-lg">{page.subtitle}</p>
          </div>
        </section>
        {renderStats(page.stats, "text-sky-700")}
        {renderFeatureCards(page.featureCards, "bg-sky-700 text-white hover:bg-sky-600")}
        {renderProcess(page.process)}
        <section className="mx-auto max-w-6xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {page.sections.flatMap((section) =>
              section.items.map((item) => (
                <div key={item} className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
                  <p className="text-sm leading-relaxed text-slate-700">{item}</p>
                </div>
              ))
            )}
          </div>
          <p className="mt-8 text-base leading-relaxed text-slate-700">{page.intro}</p>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          {faqList}
        </section>
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">{ctaBlock}</section>
      </div>
    );
  }

  if (page.key === "contact") {
    return (
      <div className="min-h-screen bg-indigo-50 text-slate-900">
        <MainNavbar />
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-900 to-violet-800 p-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Contact</p>
            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{page.title}</h1>
            <p className="mt-4 max-w-3xl text-base text-indigo-100 sm:text-lg">{page.subtitle}</p>
            <p className="mt-5 text-sm leading-relaxed text-indigo-100">{page.intro}</p>
          </div>
        </section>
        {renderStats(page.stats, "text-indigo-700")}
        {renderContactChannels(page.contactChannels)}
        {renderFeatureCards(page.featureCards, "bg-indigo-700 text-white hover:bg-indigo-600")}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-2 lg:px-8">
          {sectionCards}
        </section>
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
          {faqList}
        </section>
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">{ctaBlock}</section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <MainNavbar />

      <section className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">SeaNeB</p>
          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{page.title}</h1>
          <p className="mt-4 max-w-3xl text-base text-slate-200 sm:text-lg">{page.subtitle}</p>
        </div>
      </section>

      {renderStats(page.stats)}

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-lg leading-relaxed text-slate-700">{page.intro}</p>
      </section>

      {renderFeatureCards(page.featureCards)}
      {renderProcess(page.process)}

      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-2 lg:px-8">
        {sectionCards}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-slate-900">Frequently asked questions</h2>
        {faqList}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">{ctaBlock}</section>
    </div>
  );
}
