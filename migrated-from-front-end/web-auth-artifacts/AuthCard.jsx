"use client";

export default function AuthCard({ children, header = null }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-[420px] bg-white border border-gray-200 rounded-2xl flex flex-col max-h-[90vh]">
        {header && <div className="px-6 sm:px-8 pt-6 pb-4 shrink-0">{header}</div>}
        <div className="px-6 sm:px-8 pb-6 sm:pb-8 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
