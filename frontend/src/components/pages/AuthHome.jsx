"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCookie } from "@/services/auth.service";
import { authStore } from "@/app/auth/auth-service/store/authStore";
import { bootstrapProductAuth } from "@/app/auth/auth-service/auth.bootstrap";
import { getAuthAppUrl } from "@/lib/core/appUrls";
import {
  DASHBOARD_MODE_BUSINESS,
  DASHBOARD_MODE_USER,
  setDashboardMode,
} from "@/services/dashboard.service";

export default function AuthHome() {
  const router = useRouter();
  const [requestedMode] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("mode") || "").toLowerCase();
  });

  const hasProfile = getCookie("profile_completed") === "true";
  const hasBusiness = getCookie("business_registered") === "true";

  const modeLabel = useMemo(() => {
    if (requestedMode === "business") return "Business";
    return "User";
  }, [requestedMode]);

  useEffect(() => {
    let active = true;

    const validate = async () => {
      let sessionOk = !!authStore.getAccessToken();
      if (!sessionOk) {
        try {
          sessionOk = await bootstrapProductAuth();
        } catch {
          sessionOk = false;
        }
      }
      if (!active) return;
      if (!hasProfile && !sessionOk) {
        router.replace(getAuthAppUrl("/auth/login"));
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
    };

    validate();
    return () => {
      active = false;
    };
  }, [hasBusiness, hasProfile, requestedMode, router]);

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
