"use client";

export default function AuthOtpCard({ header, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#000_60%)] px-4 py-8">
      <div
        className="
          w-full
          max-w-md
          bg-white
          border
          border-gray-200
          rounded-2xl
          shadow-2xl
          px-6
          py-7
        "
      >
        {header}
        {children}
      </div>
    </div>
  );
}


