"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCookie } from "@/services/cookie";
import {
  DASHBOARD_MODE_BUSINESS,
  DASHBOARD_MODE_USER,
  setDashboardMode,
} from "@/services/dashboardMode.service";

export default function AuthHome() {
  const router = useRouter();
  const [requestedMode, setRequestedMode] = useState("");

  const hasProfile = getCookie("profile_completed") === "true";
  const hasSession = Boolean(getCookie("access_token")) || Boolean(getCookie("session_start_time"));
  const hasBusiness = getCookie("business_registered") === "true";

  const modeLabel = useMemo(() => {
    if (requestedMode === "business") return "Business";
    return "User";
  }, [requestedMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    setRequestedMode(String(params.get("mode") || "").toLowerCase());
  }, []);

  useEffect(() => {
    if (!hasProfile && !hasSession) {
      router.replace("/auth/login");
      return;
    }

    if (requestedMode === "business") {
      setDashboardMode(DASHBOARD_MODE_BUSINESS);
      if (!hasBusiness) {
        router.replace("/auth/business-register");
      }
      return;
    }

    setDashboardMode(DASHBOARD_MODE_USER);
  }, [hasBusiness, hasProfile, hasSession, requestedMode, router]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-semibold">Panel Home</h1>
        <p className="mb-2 text-gray-600">
          Active mode: <span className="font-semibold">{modeLabel}</span>
        </p>
        <p className="mb-4 text-gray-600">
          Profile status:{" "}
          <span className="font-semibold">{hasProfile ? "Completed" : "Incomplete"}</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded border px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            User Dashboard
          </Link>
          <Link
            href={hasBusiness ? "/dashboard/broker" : "/auth/business-register"}
            className="rounded border px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Business Dashboard
          </Link>
          <Link href="/" className="rounded border px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
