"use client"

export default function AuthCard1({
  children,
  header = null,
  maxWidth = 920,
}) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-black px-6"
      suppressHydrationWarning
    >
      <div
        className="relative w-full bg-white border border-gray-200 rounded-2xl shadow-sm max-h-[92vh] flex flex-col"
        style={{ maxWidth }}
      >
        {/* HEADER */}
        {header && (
          <div className="px-8 pt-6 pb-4 border-b border-gray-100">
            {header}
          </div>
        )}

        {/* BODY */}
        <div className="px-8 py-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
