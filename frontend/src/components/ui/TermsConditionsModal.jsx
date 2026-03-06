"use client"

import { useEffect, useState } from "react"

export default function TermsConditionsModal({
  open,
  onClose,
  title = "Terms and Conditions",
  textPath = "/legal/terms-conditions-property.txt",
}) {
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || content) return
    let active = true

    const load = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await fetch(textPath, { cache: "no-store" })
        if (!response.ok) throw new Error("Failed to load terms")
        const text = await response.text()
        if (!active) return
        setContent(String(text || "").trim())
      } catch {
        if (!active) return
        setError("Unable to load terms and conditions right now.")
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [open, textPath, content])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4">
          {loading ? <p className="text-sm text-slate-500">Loading terms...</p> : null}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {!loading && !error ? (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{content}</pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}

