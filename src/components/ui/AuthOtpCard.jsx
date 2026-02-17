"use client";

export default function AuthOtpCard({ header, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div
        className="
          w-full
          max-w-md
          bg-white
          border
          border-gray-200
          rounded-2xl
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
