"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function LanguageDropdown({ language, onChange, disabled = false, labels = {} }) {
  const languageLabel = labels.languageLabel || "Select language";
  const languageEnglish = labels.languageEnglish || "English";
  const languageGujarati = labels.languageGujarati || "Gujarati";
  const languageHindi = labels.languageHindi || "Hindi";
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const options = useMemo(
    () => [
      { value: "eng", label: languageEnglish },
      { value: "guj", label: languageGujarati },
      { value: "hindi", label: languageHindi },
    ],
    [languageEnglish, languageGujarati, languageHindi]
  );

  const selectedLabel = options.find((option) => option.value === language)?.label || languageEnglish;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative inline-block min-w-[158px]">
      <label className="sr-only" htmlFor="language-trigger">
        {languageLabel}
      </label>

      <button
        id="language-trigger"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        className="inline-flex h-10 w-full items-center justify-between rounded-full border border-[#bca271] bg-[#081746] px-3 text-white shadow-[0_10px_18px_rgba(8,23,70,0.22)] outline-none transition-all hover:bg-[#0b1f57] focus:ring-4 focus:ring-[#8fb5ff]/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex items-center gap-2.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d7c193] bg-white/10">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#f4e4c2]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
          </span>
          <span className="text-[0.95rem] font-semibold tracking-[0.02em] text-white">
            {selectedLabel}
          </span>
        </span>

        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 text-[#f4e4c2] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-full overflow-hidden rounded-xl border border-[#d8c6a0] bg-white p-1.5 shadow-[0_18px_30px_rgba(15,20,40,0.18)]">
          <ul role="listbox" aria-label={languageLabel} className="space-y-1">
            {options.map((option) => {
              const active = option.value === language;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => handleSelect(option.value)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px] font-medium transition ${
                      active
                        ? "bg-[#f7efe1] text-[#2b1f12]"
                        : "text-[#5a4b3d] hover:bg-[#f9f5ec]"
                    }`}
                  >
                    <span>{option.label}</span>
                    {active && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#b3893f]" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                        <path d="m5 12 4 4 10-10" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

