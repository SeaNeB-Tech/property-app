"use client"

import { useMemo } from "react"

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
  const isoValue = toIsoDate(value)
  const maxDate = useMemo(
    () => (maxToday ? new Date().toISOString().split("T")[0] : undefined),
    [maxToday]
  )

  return (
    <div className="group relative">
      <input
        type="date"
        value={isoValue}
        max={maxDate}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 group-hover:border-slate-400"
      />
    </div>
  )
}
