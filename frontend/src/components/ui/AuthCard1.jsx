"use client"

export default function AuthCard1({
  children,
  header = null,
  maxWidth = 920,
  scrollBody = true,
  shellClassName = "",
  cardClassName = "",
  bodyClassName = "",
}) {
  return (
    <div
      className={`auth-shell auth-shell--wide min-h-screen w-full flex ${scrollBody ? "items-center" : "items-start"} justify-center px-6 py-8 ${shellClassName}`}
      suppressHydrationWarning
    >
      <div
        className={`relative w-full bg-white border border-gray-200 rounded-2xl shadow-2xl ${scrollBody ? "max-h-[92vh]" : ""} flex flex-col ${cardClassName}`}
        style={{ maxWidth }}
      >
        {/* HEADER */}
        {header && (
          <div className="px-8 pt-6 pb-4 border-b border-gray-100">
            {header}
          </div>
        )}

        {/* BODY */}
        <div className={`px-8 py-6 ${scrollBody ? "overflow-y-auto" : ""} ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>
  )
}


