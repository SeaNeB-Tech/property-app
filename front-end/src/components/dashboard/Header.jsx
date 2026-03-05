"use client";

export default function DealerDashboardHeader() {
  const returnToMainApp = () => {
    const mainOrigin = String(process.env.NEXT_PUBLIC_APP_ORIGIN || "").trim();
    const mainUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();

    if (window.opener && mainOrigin) {
      try {
        window.opener.postMessage({ type: "SEANEB_RETURN_HOME" }, mainOrigin);
        setTimeout(() => {
          window.close();
        }, 150);
        return;
      } catch {
        // continue to fallback
      }
    }

    if (mainUrl) {
      window.location.href = mainUrl;
      return;
    }
    window.location.href = "/";
  };

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Dealer Dashboard</h1>
        <button
          type="button"
          onClick={returnToMainApp}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Visit Website
        </button>
      </div>
    </header>
  );
}
