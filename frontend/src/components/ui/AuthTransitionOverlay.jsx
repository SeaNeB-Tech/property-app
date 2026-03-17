"use client";

export default function AuthTransitionOverlay({
  title = "Please wait...",
  description = "We are processing your request.",
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-h-screen flex items-center justify-center bg-gray-50 p-6"
    >
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 text-center shadow-md">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}
