"use client"

import { useMemo, useRef } from "react"

const toIsoDate = (value) => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const parts = raw.split("-")
  if (parts.length !== 3) return ""

  // Supports both YYYY-MM-DD and DD-MM-YYYY inputs.
  if (parts[0].length === 4) return raw
  const [dd, mm, yyyy] = parts
  if (!dd || !mm || !yyyy) return ""
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
}

export default function DatePicker({ value, onChange, maxToday = true }) {
  const inputRef = useRef(null)
  const isoValue = toIsoDate(value)
  const maxDate = useMemo(
    () => (maxToday ? new Date().toISOString().split("T")[0] : undefined),
    [maxToday]
  )

  const openPicker = () => {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === "function") {
      input.showPicker()
    }
    input.focus()
  }

  return (
    <div className="group relative">
      <input
        ref={inputRef}
        type="date"
        value={isoValue}
        max={maxDate}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 pr-11 text-sm text-slate-900 shadow-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 group-hover:border-slate-400"
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition-colors hover:text-slate-700"
        aria-label="Open date picker"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
    </div>
  )
}
