"use client";

export default function DealerDashboardHeader() {
  const returnToMainApp = () => {
    const mainUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();

    if (mainUrl) {
      window.location.assign(mainUrl);
      return;
    }
    window.location.assign("/");
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
