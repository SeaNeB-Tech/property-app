"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Fully data-driven search module with an alternate visual design.
 * Functionality remains unchanged: tabs, dynamic options, filters drawer.
 */
export default function PropertySearchWidget({ searchSection }) {
  const router = useRouter();
  const tabs = searchSection?.tabs || [];
  const tabConfig = searchSection?.tabConfig || {};
  const recentSearches = searchSection?.recentSearches || ["View all searches"];

  const firstTabKey = tabs[0]?.key || "buy";
  const [activeTab, setActiveTab] = useState(firstTabKey);
  const activeConfig = tabConfig[activeTab] || {};

  const modeOptions = activeConfig.modeOptions || ["Buy", "Rent", "Lease"];
  const typeOptions = activeConfig.typeOptions || ["All Properties"];
  const categoryOptions = activeConfig.categoryOptions || [];
  const placeholder =
    String(activeConfig.placeholder || "").trim().length > 2
      ? activeConfig.placeholder
      : "Search by city, area, landmark, or project";
  const propertyTypes = activeConfig.propertyTypes || [];
  const investmentOptions = activeConfig.investmentOptions || [];
  const quickFilters = activeConfig.quickFilters || ["Budget", "Area", "Posted By"];

  const tabTheme = {
    buy: { accent: "from-blue-600 to-cyan-600", chip: "border-blue-200 bg-blue-50 text-blue-700", focus: "focus:border-blue-500" },
    rent: { accent: "from-emerald-600 to-teal-600", chip: "border-emerald-200 bg-emerald-50 text-emerald-700", focus: "focus:border-emerald-500" },
    new_launch: { accent: "from-violet-600 to-fuchsia-600", chip: "border-violet-200 bg-violet-50 text-violet-700", focus: "focus:border-violet-500" },
    commercial: { accent: "from-amber-600 to-orange-600", chip: "border-amber-200 bg-amber-50 text-amber-700", focus: "focus:border-amber-500" },
    plots_land: { accent: "from-cyan-600 to-sky-600", chip: "border-cyan-200 bg-cyan-50 text-cyan-700", focus: "focus:border-cyan-500" },
    projects: { accent: "from-indigo-600 to-blue-600", chip: "border-indigo-200 bg-indigo-50 text-indigo-700", focus: "focus:border-indigo-500" },
    post_property: { accent: "from-rose-600 to-pink-600", chip: "border-rose-200 bg-rose-50 text-rose-700", focus: "focus:border-rose-500" },
  };

  const currentTheme = tabTheme[activeTab] || tabTheme.buy;

  const [mode, setMode] = useState(modeOptions[0] || "");
  const [keyword, setKeyword] = useState("");
  const [propertyType, setPropertyType] = useState(typeOptions[0] || "");
  const [showFilters, setShowFilters] = useState(false);
  const [searchError, setSearchError] = useState("");

  function handleTabChange(nextTab) {
    setActiveTab(nextTab);
    const nextConfig = tabConfig[nextTab] || {};
    setMode(nextConfig.modeOptions?.[0] || "");
    setPropertyType(nextConfig.typeOptions?.[0] || "");
    setShowFilters(false);
    setSearchError("");
  }

  function runSearch(rawKeyword) {
    const query = String(rawKeyword || "").trim();
    if (query.length < 2) {
      setSearchError("Enter at least 2 characters to search.");
      return;
    }

    const params = new URLSearchParams();
    params.set("q", query);
    if (activeTab) params.set("tab", activeTab);
    if (mode) params.set("mode", mode);
    if (propertyType) params.set("type", propertyType);

    setSearchError("");
    router.push(`/in?${params.toString()}`);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    runSearch(keyword);
  }

  const inputClass = `h-11 rounded-xl border border-slate-600/80 bg-slate-900/70 px-3 text-sm font-medium text-slate-100 outline-none transition ${currentTheme.focus} focus:ring-4 focus:ring-slate-800 placeholder:text-slate-400`;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/90 shadow-[0_30px_70px_-40px_rgba(2,6,23,0.95)] backdrop-blur">
      <div className={`bg-gradient-to-r ${currentTheme.accent} p-[1px]`}>
        <div className="rounded-[22px] bg-slate-950/95 px-3 py-3 backdrop-blur sm:px-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-200/80">SeaNeB Property Search</p>
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                showFilters ? currentTheme.chip : "border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-500"
              }`}
            >
              {showFilters ? "Filters Open" : "Open Filters"}
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? `bg-gradient-to-r ${currentTheme.accent} text-white`
                    : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge ? (
                  <span className="ml-2 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">{tab.badge}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/70 px-3 py-3 sm:px-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-2 md:grid-cols-[150px_220px_1fr_auto]">
          <select value={mode} onChange={(event) => setMode(event.target.value)} className={inputClass}>
            {modeOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)} className={inputClass}>
            {typeOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 21L16.65 16.65M18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                if (searchError) setSearchError("");
              }}
              placeholder={placeholder}
              className={`${inputClass} w-full pl-10`}
            />
          </div>

          <button type="submit" className={`h-11 rounded-lg bg-gradient-to-r ${currentTheme.accent} px-6 text-sm font-semibold text-white`}>
            Search
          </button>
        </form>

        {searchError ? <p className="mt-2 text-xs text-rose-300">{searchError}</p> : null}

        {categoryOptions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {categoryOptions.map((category, idx) => (
              <button
                key={category}
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  idx === 0 ? currentTheme.chip : "border border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-500"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400">Recent:</span>
          {recentSearches.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => runSearch(item)}
              className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {showFilters ? (
        <div className="border-t border-slate-700 bg-slate-950/95 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-100">Smart Filter Drawer</h4>
            <button type="button" className="text-xs font-semibold text-slate-400 hover:text-slate-200">
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <p className="text-sm font-semibold text-slate-100">Property Types</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {propertyTypes.map((item) => (
                  <label key={item} className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <p className="text-sm font-semibold text-slate-100">Investment Options</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {investmentOptions.map((item) => (
                  <label key={item} className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Advanced Dropdown Filters</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {quickFilters.map((item) => (
                <select key={item} className={inputClass} defaultValue={item}>
                  <option>{item}</option>
                  <option>Any {item}</option>
                  <option>Popular {item}</option>
                  <option>Premium {item}</option>
                </select>
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" className={`rounded-xl bg-gradient-to-r ${currentTheme.accent} px-4 py-2 text-xs font-semibold text-white`}>
              Apply Filters
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
