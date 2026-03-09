"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardHeader from "@/components/dashboard/Header";
import AppHeader from "@/components/ui/AppHeader";
import { getCookie } from "@/services/auth.service";
import { ensureSessionReady } from "@/app/auth/auth-service/auth.bootstrap";
import { getAuthAppUrl } from "@/lib/core/appUrls";

const readCookieValue = (name, fallback = "-") => {
  const value = String(getCookie(name) || "").trim();
  return value || fallback;
};

export default function BrokerDashboardShell() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    let active = true;

    const validate = async () => {
      const hasSession = await ensureSessionReady({ force: true });
      if (!active) return;

      if (!hasSession) {
        router.replace(getAuthAppUrl("/auth/login"));
        return;
      }

      if (getCookie("business_registered") !== "true") {
        router.replace("/auth/business-register");
        return;
      }

      setSessionChecked(true);
    };

    void validate();
    return () => {
      active = false;
    };
  }, [router]);

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Preparing dashboard...
      </div>
    );
  }

  const businessName = readCookieValue("business_name", "Your Business");
  const businessType = readCookieValue("business_type", "Not set");
  const location = readCookieValue("business_location", "Not set");
  const businessId = readCookieValue("business_id");
  const branchId = readCookieValue("branch_id");

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <DashboardHeader
        title={businessName}
        subtitle="This dashboard now stays inside the auth app so your authenticated business flow remains local."
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Registration Status</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Active</h2>
            <p className="mt-2 text-sm text-slate-600">Your business profile is available in this auth app dashboard.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Business ID</p>
            <h2 className="mt-2 break-all text-lg font-semibold text-slate-900">{businessId}</h2>
            <p className="mt-2 text-sm text-slate-600">Primary branch: {branchId}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Business Type</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">{businessType}</h2>
            <p className="mt-2 text-sm text-slate-600">Location: {location}</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Business Overview</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Business Name</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{businessName}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Location</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{location}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Business Cookie Flag</p>
                <p className="mt-2 text-sm font-medium text-emerald-700">business_registered=true</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Session Mode</p>
                <p className="mt-2 text-sm font-medium text-slate-900">Auth app local session</p>
              </div>
            </div>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Next Actions</h3>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => router.push("/auth/business-register")}
                className="flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              >
                Edit Business Profile
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Go To Auth Home
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
