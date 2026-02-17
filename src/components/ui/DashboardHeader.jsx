"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, getJsonCookie } from "@/services/cookie";
import {
  DASHBOARD_MODE_BUSINESS,
  DASHBOARD_MODE_USER,
  getDashboardMode,
  isBusinessRegistered,
  setDashboardMode,
} from "@/services/dashboardMode.service";
import BrandLogo from "./BrandLogo";

export default function DashboardHeader({ showLogout = true }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [dashboardMode, setDashboardModeState] = useState(DASHBOARD_MODE_USER);
  const [hasBusiness, setHasBusiness] = useState(false);
  const dropdownRef = useRef(null);

  const userEmail = useMemo(() => getLoggedInEmail(), []);

  useEffect(() => {
    setDashboardModeState(getDashboardMode());
    setHasBusiness(isBusinessRegistered());
  }, []);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const clearAuthCookies = () => {
    const keys = [
      "access_token",
      "refresh_token",
      "mobile_verified",
      "otp_mobile",
      "otp_cc",
      "profile_completed",
      "verified_email",
      "verified_business_email",
      "verified_business_mobile",
      "business_mobile_otp_until",
      "otp_context",
      "reg_form_draft",
      "csrf_token",
      "csrf-token",
      "XSRF-TOKEN",
      "xsrf-token",
      "_csrf",
      "session_start_time",
      "access_token_issued_time",
      "product_key",
      "dashboard_mode",
      "business_registered",
      "business_id",
      "branch_id",
      "business_name",
      "business_type",
      "business_location",
    ];

    for (const key of keys) {
      document.cookie = `${key}=; max-age=0; path=/;`;
    }
  };

  const handleSwitchAccount = async () => {
    try {
      setIsLoading(true);
      clearAuthCookies();
      router.push("/auth/login");
    } catch (err) {
      console.error("Switch account error:", err);
    } finally {
      setIsLoading(false);
      setIsProfileOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      clearAuthCookies();
      router.push("/");
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeSwitch = () => {
    setIsProfileOpen(false);

    if (dashboardMode === DASHBOARD_MODE_BUSINESS) {
      setDashboardMode(DASHBOARD_MODE_USER);
      setDashboardModeState(DASHBOARD_MODE_USER);
      router.push("/dashboard");
      return;
    }

    if (!hasBusiness) {
      router.push("/auth/business-register");
      return;
    }

    setDashboardMode(DASHBOARD_MODE_BUSINESS);
    setDashboardModeState(DASHBOARD_MODE_BUSINESS);
    router.push("/dashboard/broker");
  };

  return (
    <header className="sticky top-0 z-40 h-16 w-full border-b border-gray-200 bg-white shadow-md">
      <div className="flex h-full w-full items-center justify-between px-4 sm:px-6 lg:px-8 lg:pl-[18rem]">
        <Link href="/" className="group transition-opacity hover:opacity-85">
          <div className="transition-transform group-hover:scale-110">
            <BrandLogo
              size={36}
              titleClass="text-xl font-bold text-gray-900"
              subtitleClass="text-xs font-medium text-gray-600"
              textWrapperClass="hidden sm:block"
            />
          </div>
        </Link>

        <div className="flex items-center gap-3" ref={dropdownRef}>
          <div
            className={`hidden items-center rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex ${
              dashboardMode === DASHBOARD_MODE_BUSINESS
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {dashboardMode === DASHBOARD_MODE_BUSINESS ? "Business Mode" : "User Mode"}
          </div>

          <button
            type="button"
            onClick={() => setIsProfileOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              {getEmailInitials(userEmail)}
            </span>
            <span className="hidden sm:inline">Profile</span>
            <span className="text-xs text-gray-400">{isProfileOpen ? "▲" : "▼"}</span>
          </button>

          {isProfileOpen && (
            <div className="absolute right-4 top-14 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:right-6 lg:right-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Logged in as</p>
              <p className="mt-1 truncate text-sm font-semibold text-gray-900">{userEmail}</p>
              <button
                type="button"
                onClick={handleModeSwitch}
                className="mt-4 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
              >
                {dashboardMode === DASHBOARD_MODE_BUSINESS
                  ? "Switch to User Dashboard"
                  : hasBusiness
                    ? "Switch to Business Dashboard"
                    : "Business Register"}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleSwitchAccount}
                className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
              >
                Switch Account
              </button>
              {showLogout && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleLogout}
                  className="mt-3 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                >
                  {isLoading ? "Logging out..." : "Logout"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function getEmailInitials(email) {
  if (!email || typeof email !== "string") return "U";
  const first = email.trim().charAt(0).toUpperCase();
  return first || "U";
}

function decodeJwtEmail(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload?.email || payload?.user_email || payload?.sub || null;
  } catch {
    return null;
  }
}

function getLoggedInEmail() {
  const direct =
    getCookie("verified_email") ||
    getCookie("user_email") ||
    getJsonCookie("reg_form_draft")?.email ||
    getJsonCookie("otp_context")?.email;

  if (direct) return direct;

  const fromAccessToken = decodeJwtEmail(getCookie("access_token"));
  if (fromAccessToken) return fromAccessToken;

  return "No email found";
}
