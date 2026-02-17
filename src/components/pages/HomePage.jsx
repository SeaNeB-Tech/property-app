"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import phoneCodes from "@/constants/phoneCodes.json";
import BrandLogo from "@/components/ui/BrandLogo";
import navbarLinks from "@/data/navbarLinks.json";

export default function HomePage() {
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      setCanInstall(false);
    }
  };

  const countryList = ["India", "United States", "Australia", "Singapore"];
  const navLinks = navbarLinks;
  const quickSearches = ["Ahmedabad", "Mumbai", "Bengaluru", "Pune"];

  const runSearch = (value) => {
    const query = String(value || "").trim();
    if (query.length < 2) {
      setSearchError("Enter at least 2 characters to search.");
      return;
    }

    setSearchError("");
    router.push(`/in?q=${encodeURIComponent(query)}`);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    runSearch(searchQuery);
  };

  return (
    <div className={`min-h-screen transition-colors ${isDark ? "bg-gradient-to-b from-black via-zinc-950 to-black text-slate-100" : "bg-gradient-to-b from-slate-50 to-white text-slate-900"}`}>
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/95 backdrop-blur transition-colors">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/home" className="transition-opacity hover:opacity-90">
            <BrandLogo
              size={44}
              titleClass="text-lg font-bold text-white"
              subtitleClass="text-xs text-slate-400"
            />
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {navLinks.map((link) => (
              <Link key={link.name} href={link.href} className="text-sm font-medium text-slate-300 transition-colors hover:text-white">
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              className="rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-700 sm:text-sm"
            >
              {isDark ? "Light Mode" : "Dark Mode"}
            </button>
            {canInstall && (
              <button
                type="button"
                onClick={handleInstall}
                className="hidden rounded-full border border-cyan-700 bg-cyan-900/40 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/70 sm:inline-block"
              >
                Install App
              </button>
            )}
            <Link
              href="/auth/login"
              className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
            >
              Login
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className={`absolute inset-0 ${isDark ? "bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_85%_10%,rgba(59,130,246,0.16),transparent_42%)]" : "bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.18),transparent_38%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.16),transparent_42%)]"}`} />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20">
          <div className="space-y-6">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${isDark ? "border border-slate-700 bg-slate-900 text-slate-200" : "border border-slate-300 bg-white text-slate-700"}`}>
              Trusted Real Estate Discovery
            </span>
            <h1 className={`text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl ${isDark ? "text-white" : "text-slate-900"}`}>
              Find Properties Near You, Faster
            </h1>
            <p className={`max-w-xl text-base leading-relaxed sm:text-lg ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Search verified apartments, houses, and commercial properties with one clean flow. Compare locations and connect quickly.
            </p>

            <div className={`rounded-2xl p-3 shadow-sm ${isDark ? "border border-slate-700 bg-slate-900/90" : "border border-slate-200 bg-white"}`}>
              <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    if (searchError) setSearchError("");
                  }}
                  placeholder="Search by city, area, or pincode"
                  className={`h-11 w-full rounded-xl border px-4 text-sm outline-none transition-all ${isDark ? "border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-900/60" : "border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"}`}
                />
                <button
                  type="submit"
                  className={`h-11 rounded-xl px-6 text-sm font-semibold transition-all ${isDark ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 hover:from-cyan-400 hover:to-blue-400" : "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"}`}
                >
                  Search
                </button>
              </form>
              {searchError ? (
                <p className={`mt-2 text-xs ${isDark ? "text-rose-300" : "text-rose-600"}`}>{searchError}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {quickSearches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => runSearch(item)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${isDark ? "border border-slate-600 bg-slate-800 text-slate-200 hover:border-cyan-500" : "border border-slate-300 bg-slate-100 text-slate-700 hover:border-blue-400"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {["Apartments", "Villas", "Commercial", "Plots"].map((tag) => (
                <span key={tag} className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className={`relative w-full max-w-md overflow-hidden rounded-3xl p-4 shadow-2xl ${isDark ? "border border-slate-700 bg-slate-900/95" : "border border-slate-200 bg-white"}`}>
              <div className="relative h-56 overflow-hidden rounded-2xl">
                <Image
                  src="/assets/home/home-hero.jpg"
                  alt="Featured property"
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 420px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
                <div className="absolute left-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">Verified</div>
                <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-white/25 bg-black/35 px-3 py-2 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Top Match</p>
                  <h3 className="mt-1 text-base font-bold text-white">SeaNeB Premium Apartment</h3>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className={`rounded-xl p-3 ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                  <p className={`text-[11px] ${isDark ? "text-slate-300" : "text-slate-500"}`}>Starting</p>
                  <p className={`mt-1 text-sm font-bold ${isDark ? "text-cyan-300" : "text-blue-700"}`}>INR 58,00,000</p>
                </div>
                <div className={`rounded-xl p-3 ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                  <p className={`text-[11px] ${isDark ? "text-slate-300" : "text-slate-500"}`}>Configuration</p>
                  <p className={`mt-1 text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>2 BHK</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`py-14 sm:py-16 ${isDark ? "bg-black" : "bg-white"}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className={`text-3xl font-bold sm:text-4xl ${isDark ? "text-white" : "text-slate-900"}`}>Browse by Property Type</h2>
            <p className={`mt-3 ${isDark ? "text-slate-300" : "text-slate-600"}`}>Choose the format that fits your buying goals.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {[
              { icon: "/icons/apartment.svg", label: "Apartments" },
              { icon: "/icons/house.svg", label: "Houses" },
              { icon: "/icons/commercial.svg", label: "Commercial" },
              { icon: "/icons/land.svg", label: "Land" },
            ].map((cat) => (
              <button
                key={cat.label}
                className={`group rounded-2xl p-5 text-center transition-all hover:-translate-y-1 hover:shadow-lg ${isDark ? "border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-800 hover:border-cyan-500" : "border border-slate-200 bg-gradient-to-b from-white to-slate-50 hover:border-blue-300"}`}
              >
                <div className="mb-3 flex justify-center">
                  <Image
                    src={cat.icon}
                    alt={cat.label}
                    width={44}
                    height={44}
                    className="h-11 w-11 transition-transform group-hover:scale-110"
                  />
                </div>
                <p className={`text-sm font-semibold sm:text-base ${isDark ? "text-slate-100" : "text-slate-900"}`}>{cat.label}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={`py-14 sm:py-16 ${isDark ? "bg-zinc-950" : "bg-slate-50"}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className={`text-3xl font-bold sm:text-4xl ${isDark ? "text-white" : "text-slate-900"}`}>Available Countries</h2>
            <p className={`mt-3 ${isDark ? "text-slate-300" : "text-slate-600"}`}>Explore listings across multiple regions.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {countryList.map((name) => {
              const info = phoneCodes.find((p) => p.name === name) || {};
              const flag = info.flag || `/icons/${name.toLowerCase().replace(/[^a-z]/g, "")}.svg`;
              return (
                <button
                  key={name}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${isDark ? "border border-slate-700 bg-slate-800 text-slate-100 hover:border-cyan-500 hover:bg-slate-700" : "border border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50"}`}
                >
                  <Image src={flag} alt={name} width={24} height={16} className="h-4 w-6 object-contain" />
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section id="download" className={`py-16 ${isDark ? "bg-black" : ""}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className={`grid grid-cols-1 gap-10 overflow-hidden rounded-3xl p-8 text-white shadow-xl lg:grid-cols-2 lg:p-12 ${isDark ? "border border-zinc-800 bg-gradient-to-r from-zinc-900 to-slate-900" : "bg-gradient-to-r from-blue-700 to-cyan-600"}`}>
            <div className="space-y-4">
              <h3 className="text-3xl font-bold sm:text-4xl">Get SeaNeB on Your Phone</h3>
              <p className="text-blue-100">
                Use the app to track listings, save favorites, and receive updates instantly.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Instant Alerts", "Saved Searches", "Verified Leads"].map((item) => (
                  <span key={item} className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                    {item}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href="https://play.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold ${isDark ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-white text-blue-700 hover:bg-blue-50"}`}
                >
                  <span className="text-base">▶</span>
                  Google Play
                </a>
                <a
                  href="https://apps.apple.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold ${isDark ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-white text-blue-700 hover:bg-blue-50"}`}
                >
                  <span className="text-base">◉</span>
                  App Store
                </a>
              </div>
            </div>
            <div className="relative flex items-center justify-center lg:justify-end">
              <div className="relative h-[330px] w-[250px]">
                <div className={`absolute inset-0 rounded-[2rem] ${isDark ? "bg-cyan-400/20" : "bg-white/35"} blur-2xl`} />
                <div className={`absolute inset-0 overflow-hidden rounded-[2rem] border p-2 shadow-2xl ${isDark ? "border-cyan-300/35 bg-slate-950/80" : "border-white/60 bg-white/20 backdrop-blur"}`}>
                  <div className="relative h-full w-full overflow-hidden rounded-[1.5rem]">
                    <Image
                      src="/assets/propertyimages/image.png"
                      alt="SeaNeB mobile app preview"
                      fill
                      className="object-cover"
                      sizes="250px"
                    />
                  </div>
                </div>
              </div>

              <div className={`absolute -left-2 bottom-3 max-w-[180px] rounded-xl border px-3 py-2 text-xs ${isDark ? "border-slate-600 bg-slate-900/90 text-slate-200" : "border-white/70 bg-white/80 text-slate-700"}`}>
                <p className="font-semibold">Live Notification</p>
                <p className="mt-1">3 new verified leads in Ahmedabad.</p>
              </div>

              <div className="absolute -right-3 -top-2 hidden h-20 w-20 overflow-hidden rounded-2xl border border-white/40 sm:block">
                <Image
                  src="/assets/home/home-hero.jpg"
                  alt="Property thumbnail"
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`py-14 text-white sm:py-16 ${isDark ? "bg-black" : "bg-slate-900"}`}>
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">Ready to Find Your Next Property?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">
            Join SeaNeB and discover verified opportunities in your preferred location.
          </p>
          <Link href="/auth/login" className={`mt-6 inline-block rounded-xl px-7 py-3 text-sm font-semibold transition-colors ${isDark ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "bg-white text-slate-900 hover:bg-slate-100"}`}>
            Get Started
          </Link>
        </div>
      </section>
    </div>
  );
}

