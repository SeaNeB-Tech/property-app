"use client";

/**
 * Shared error block for route error boundaries.
 */
export default function PageErrorState({ message = "Something went wrong.", reset }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">Unable to load page</h1>
      <p className="mt-3 text-sm text-slate-600 sm:text-base">{message}</p>
      {reset ? (
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Try Again
        </button>
      ) : null}
    </div>
  );
}
