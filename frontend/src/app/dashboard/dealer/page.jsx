import DealerDashboardHeader from "@/components/dashboard/Header";

export default function DealerDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <DealerDashboardHeader />
      <main className="mx-auto max-w-5xl p-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Business Registration Complete</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your business profile is now active. Use the button above to return to the main website.
          </p>
        </section>
      </main>
    </div>
  );
}
