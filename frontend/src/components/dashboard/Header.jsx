"use client";

export default function DashboardHeader({
  title = "Business Dashboard",
  subtitle = "Manage your business profile and registration details.",
}) {
  const returnToMainApp = () => {
    const mainUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();

    if (mainUrl) {
      window.location.assign(mainUrl);
      return;
    }
    window.location.assign("/");
  };

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={returnToMainApp}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Visit Website
        </button>
      </div>
    </header>
  );
}
