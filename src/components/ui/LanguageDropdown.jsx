"use client";

export default function LanguageDropdown({ language, onChange, disabled = false, labels = {} }) {
  const languageLabel = labels.languageLabel || "Select language";
  const languageEnglish = labels.languageEnglish || "English";
  const languageGujarati = labels.languageGujarati || "Gujarati";
  const languageHindi = labels.languageHindi || "Hindi";

  return (
    <div className="relative inline-block min-w-[150px]">
      <label className="sr-only" htmlFor="language-select">
        {languageLabel}
      </label>
      <select
        id="language-select"
        value={language}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-full border border-blue-600 bg-slate-900 pl-4 pr-10 text-sm font-semibold uppercase tracking-wide text-white outline-none transition-all hover:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="eng">{languageEnglish}</option>
        <option value="guj">{languageGujarati}</option>
        <option value="hindi">{languageHindi}</option>
      </select>
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-200">
        ▼
      </span>
    </div>
  );
}
