"use client"

import { useEffect, useMemo, useRef, useState } from "react"

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const CLOSE_DELAY_MS = 200

const pad = (value) => String(value).padStart(2, "0")

const toIsoDate = (value) => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const parts = raw.split("-")
  if (parts.length !== 3) return ""

  if (parts[0].length === 4) return raw
  const [dd, mm, yyyy] = parts
  if (!dd || !mm || !yyyy) return ""
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
}

const dateToIso = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const dateFromIso = (value) => {
  const iso = toIsoDate(value)
  if (!iso) return null
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return null
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatTriggerDate = (date) => {
  if (!date) return ""
  return `${pad(date.getDate())} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`
}

const formatHeaderParts = (date) => ({
  day: pad(date.getDate()),
  month: MONTHS_SHORT[date.getMonth()],
  year: String(date.getFullYear()),
  weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
})

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)
const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1)
const addYears = (date, amount) => new Date(date.getFullYear() + amount, date.getMonth(), 1)
const sameDay = (left, right) =>
  Boolean(left) &&
  Boolean(right) &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const isAfterDate = (left, right) => {
  if (!left || !right) return false
  return dateToIso(left) > dateToIso(right)
}

const buildCalendarDays = (displayMonth, maxDate) => {
  const firstDay = startOfMonth(displayMonth)
  const startWeekday = firstDay.getDay()
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - startWeekday)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)

    return {
      date,
      iso: dateToIso(date),
      inMonth: date.getMonth() === displayMonth.getMonth(),
      disabled: date.getMonth() !== displayMonth.getMonth() || isAfterDate(date, maxDate),
    }
  })
}

const ChevronLeft = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
    <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ChevronRight = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
    <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CalendarIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
    <rect x="3.25" y="4.25" width="13.5" height="12.5" rx="2.25" stroke="currentColor" strokeWidth="1.3" />
    <path d="M6.5 2.75v3M13.5 2.75v3M3.25 7.25h13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

export default function DatePicker({ value, onChange, onClose, maxToday = true }) {
  const rootRef = useRef(null)
  const closeTimerRef = useRef(null)
  const selectedDate = useMemo(() => dateFromIso(value), [value])
  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])
  const maxDate = useMemo(() => (maxToday ? today : null), [maxToday, today])
  const [open, setOpen] = useState(false)
  const [view, setView] = useState("days")
  const [animationKey, setAnimationKey] = useState(0)
  const [headerAnimationKey, setHeaderAnimationKey] = useState(0)
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(selectedDate || today))

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setView("days")
        onClose?.()
      }
    }

    const handleEscape = (event) => {
      if (event.key !== "Escape") return
      setOpen(false)
      setView("days")
      onClose?.()
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose, open])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const showDate = selectedDate || today
  const headerParts = formatHeaderParts(showDate)
  const calendarDays = useMemo(
    () => buildCalendarDays(displayMonth, maxDate),
    [displayMonth, maxDate]
  )
  const currentYear = displayMonth.getFullYear()
  const maxYear = maxDate?.getFullYear() || currentYear + 30
  const minYear = Math.min(selectedDate?.getFullYear() || currentYear, today.getFullYear()) - 100
  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index),
    [maxYear, minYear]
  )

  const triggerLabel = selectedDate ? formatTriggerDate(selectedDate) : ""
  const isFutureMonthVisible =
    Boolean(maxDate) &&
    new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0) >=
      new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())

  const closePicker = () => {
    setOpen(false)
    setView("days")
    onClose?.()
  }

  const queueClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = window.setTimeout(() => {
      closePicker()
      closeTimerRef.current = null
    }, CLOSE_DELAY_MS)
  }

  const openPicker = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setDisplayMonth(startOfMonth(selectedDate || today))
    setView("days")
    setAnimationKey((value) => value + 1)
    setOpen(true)
  }

  const selectDate = (date) => {
    if (maxDate && isAfterDate(date, maxDate)) return
    onChange?.(dateToIso(date))
    setDisplayMonth(startOfMonth(date))
    setHeaderAnimationKey((value) => value + 1)
    queueClose()
  }

  const jumpToToday = () => {
    setDisplayMonth(startOfMonth(today))
    selectDate(today)
  }

  const clearValue = () => {
    onChange?.("")
    setDisplayMonth(startOfMonth(today))
    setHeaderAnimationKey((value) => value + 1)
  }

  const openMonthsView = () => {
    setView("months")
    setAnimationKey((value) => value + 1)
  }

  const openYearsView = () => {
    setView("years")
    setAnimationKey((value) => value + 1)
  }

  const pickMonth = (monthIndex) => {
    const next = new Date(displayMonth.getFullYear(), monthIndex, 1)
    if (maxDate && next.getFullYear() === maxDate.getFullYear() && monthIndex > maxDate.getMonth()) {
      return
    }
    setDisplayMonth(next)
    setView("days")
    setAnimationKey((value) => value + 1)
  }

  const pickYear = (year) => {
    const nextMonth = maxDate && year === maxDate.getFullYear()
      ? Math.min(displayMonth.getMonth(), maxDate.getMonth())
      : displayMonth.getMonth()
    setDisplayMonth(new Date(year, nextMonth, 1))
    setView("months")
    setAnimationKey((value) => value + 1)
  }

  return (
    <div className="group relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => (open ? closePicker() : openPicker())}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 group-hover:border-slate-400"
        style={{ textAlign: "left" }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="relative flex h-full items-center gap-2 pr-8">
          <span className="text-slate-900">
            <CalendarIcon />
          </span>
          <span className={triggerLabel ? "text-slate-900" : "text-slate-400"}>
            {triggerLabel || "Select date"}
          </span>
          <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-400">
            <ChevronRight />
          </span>
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-full min-w-[208px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
          role="dialog"
          aria-label="Choose date"
        >
          <div className="rounded-t-lg bg-slate-900 px-2 py-2 text-white">
            <div className="mb-1 text-[8px] font-medium uppercase tracking-[0.18em] text-blue-100">
              SeaNeB Real Estate
            </div>
            <div key={headerAnimationKey} className="datepicker-header-pop flex items-center gap-1.5">
              <div className="min-w-[1.9rem] text-[1.6rem] font-semibold leading-none">{headerParts.day}</div>
              <div className="min-w-0">
                <div className="text-[11px] font-medium leading-4 text-blue-100">
                  {headerParts.month} {headerParts.year}
                </div>
                <div className="text-[9px] uppercase tracking-[0.16em] text-white/70">
                  {headerParts.weekday}
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-300 bg-white px-2 py-1.5">
            <div className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900 shadow-sm outline-none transition-all duration-200 group-hover:border-slate-400">
              <div className="flex h-full items-center gap-1.5">
                <span className="text-slate-900">
                  <CalendarIcon />
                </span>
                <span className={triggerLabel ? "text-slate-900" : "text-slate-400"}>
                  {triggerLabel || "Select date"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white px-2 py-2">
            {view === "days" && (
              <div key={`days-${animationKey}-${displayMonth.getFullYear()}-${displayMonth.getMonth()}`} className="datepicker-view-enter">
                <div className="mb-2 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => setDisplayMonth((value) => addMonths(value, -1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400"
                    aria-label="Previous month"
                  >
                    <ChevronLeft />
                  </button>

                  <button
                    type="button"
                    onClick={openMonthsView}
                    className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-900 transition-all duration-200 hover:bg-blue-100"
                  >
                    {MONTHS_LONG[displayMonth.getMonth()]} {displayMonth.getFullYear()}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDisplayMonth((value) => addMonths(value, 1))}
                    disabled={isFutureMonthVisible}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Next month"
                  >
                    <ChevronRight />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {DAYS_SHORT.map((day) => (
                    <div key={day} className="py-1 text-center text-[9px] font-medium text-slate-400">
                      {day}
                    </div>
                  ))}

                  {calendarDays.map((item) => {
                    const isSelected = sameDay(item.date, selectedDate)
                    const isToday = sameDay(item.date, today)

                    if (!item.inMonth) {
                      return (
                        <div
                          key={item.iso}
                          className="flex h-7 items-center justify-center text-[11px] text-slate-300"
                        >
                          {item.date.getDate()}
                        </div>
                      )
                    }

                    return (
                      <button
                        key={item.iso}
                        type="button"
                        onClick={() => selectDate(item.date)}
                        disabled={item.disabled}
                        className={`relative flex h-7 items-center justify-center rounded-full text-[11px] transition-all duration-200 ${
                          isSelected
                            ? "scale-105 bg-slate-900 text-white"
                            : "bg-white text-slate-900 hover:bg-blue-100"
                        } ${item.disabled ? "cursor-not-allowed opacity-40" : ""}`}
                      >
                        <span>{item.date.getDate()}</span>
                        {isToday && (
                          <span
                            className={`absolute bottom-1 h-1 w-1 rounded-full ${
                              isSelected ? "bg-white" : "bg-blue-500"
                            }`}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {view === "months" && (
              <div key={`months-${animationKey}-${displayMonth.getFullYear()}`} className="datepicker-view-enter">
                <div className="mb-2 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => setDisplayMonth((value) => addYears(value, -1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400"
                    aria-label="Previous year"
                  >
                    <ChevronLeft />
                  </button>

                  <button
                    type="button"
                    onClick={openYearsView}
                    className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-900 transition-all duration-200 hover:bg-blue-100"
                  >
                    {displayMonth.getFullYear()}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDisplayMonth((value) => addYears(value, 1))}
                    disabled={Boolean(maxDate) && displayMonth.getFullYear() >= maxDate.getFullYear()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Next year"
                  >
                    <ChevronRight />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {MONTHS_SHORT.map((month, index) => {
                    const isSelectedMonth =
                      index === displayMonth.getMonth() &&
                      displayMonth.getFullYear() === (selectedDate?.getFullYear() || displayMonth.getFullYear())
                    const isDisabled =
                      Boolean(maxDate) &&
                      displayMonth.getFullYear() === maxDate.getFullYear() &&
                      index > maxDate.getMonth()

                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => pickMonth(index)}
                        disabled={isDisabled}
                        className={`h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400 ${
                          isSelectedMonth ? "ring-4 ring-blue-100" : ""
                        } ${isDisabled ? "cursor-not-allowed opacity-40" : ""}`}
                      >
                        {month}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {view === "years" && (
              <div key={`years-${animationKey}-${displayMonth.getFullYear()}`} className="datepicker-view-enter">
                <div className="mb-2 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setView("months")
                      setAnimationKey((value) => value + 1)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400"
                    aria-label="Back to months"
                  >
                    <ChevronLeft />
                  </button>
                  <div className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-900">
                    Select year
                  </div>
                  <div className="h-8 w-8" />
                </div>

                <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {years.map((year) => {
                    const isSelectedYear = year === displayMonth.getFullYear()
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => pickYear(year)}
                        className={`h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400 ${
                          isSelectedYear ? "ring-4 ring-blue-100" : ""
                        }`}
                      >
                        {year}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-1 border-t border-slate-300 bg-white px-2 py-2">
            <button
              type="button"
              onClick={clearValue}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={jumpToToday}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-400"
            >
              Jump to today
            </button>
          </div>

          <style jsx>{`
            .datepicker-header-pop {
              animation: datepicker-pop 0.36s cubic-bezier(0.22, 1, 0.36, 1);
              transform-origin: left center;
            }

            .datepicker-view-enter {
              animation: datepicker-view-in 0.26s cubic-bezier(0.22, 1, 0.36, 1);
              transform-origin: top center;
            }

            @keyframes datepicker-pop {
              0% {
                opacity: 0.75;
                transform: scale(0.94) translateY(4px);
              }
              60% {
                opacity: 1;
                transform: scale(1.04) translateY(0);
              }
              100% {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }

            @keyframes datepicker-view-in {
              0% {
                opacity: 0;
                transform: translateY(10px) scale(0.98);
              }
              100% {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
