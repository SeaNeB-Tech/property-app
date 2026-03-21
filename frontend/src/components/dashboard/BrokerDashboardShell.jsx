"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCookie, removeCookie, setCookie } from "@/services/auth.service";
import BrandLogo from "@/components/ui/BrandLogo";
import { getAuthLoginUrl, getListingAppUrl } from "@/lib/core/appUrls";
import { useAuth } from "@/lib/auth/AuthContext";
import { logoutPanelSession } from "@/services/auth.service";
import { getAccessToken, getCsrfToken } from "@/lib/auth/tokenStorage";
import { refreshAccessToken } from "@/lib/api/client";
import { clearRefreshBudget } from "@/lib/auth/refreshBudget";

const hasBusinessRegistration = (user = null) => {
  const record = user && typeof user === "object" ? user : {};
  const boolHints = [
    record?.is_business_registered,
    record?.isBusinessRegistered,
    record?.business_registered,
    record?.has_business,
    record?.hasBusiness,
  ];
  if (boolHints.some((value) => value === true || String(value || "").trim().toLowerCase() === "true")) {
    return true;
  }

  const idHints = [
    record?.business_id,
    record?.businessId,
    record?.current_business_id,
    record?.branch_id,
    record?.branchId,
    record?.business?.id,
    record?.business?.business_id,
  ];
  return idHints.some((value) => String(value || "").trim().length > 0);
};

const clearBusinessRegistrationHints = () => {
  [
    "business_registered",
    "business_id",
    "branch_id",
    "business_name",
    "business_type",
    "business_location",
    "dashboard_mode",
  ].forEach((key) => removeCookie(key));
};

export default function BrokerDashboardShell() {
  const router = useRouter();
  const { status, isRestoring, isReady, user, logout, restoreSession } = useAuth();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef(null);
  const tokenHydrateAttemptedRef = useRef(false);
  const profileHydrateAttemptedRef = useRef(false);

  const userName = useMemo(
    () =>
      String(
        user?.full_name ||
          user?.fullName ||
          user?.first_name ||
          user?.firstName ||
          user?.name ||
          "Profile"
      ).trim(),
    [user]
  );
  const userInitial = String(userName || "P").charAt(0).toUpperCase();

  useEffect(() => {
    let active = true;

    const validate = async () => {
      if (!active || !isReady || isRestoring || status === "restoring") return;

      if (status !== "authenticated") return;

      if (!tokenHydrateAttemptedRef.current) {
        tokenHydrateAttemptedRef.current = true;
        const hasAccessToken = Boolean(String(getAccessToken() || "").trim());
        const hasCsrfToken = Boolean(String(getCsrfToken() || "").trim());
        if (!hasAccessToken || !hasCsrfToken) {
          try {
            await refreshAccessToken();
          } catch (err) {
            const code = String(
              err?.response?.data?.code || err?.data?.code || ""
            )
              .trim()
              .toUpperCase();
            if (code === "REFRESH_LIMIT_REACHED") {
              clearRefreshBudget();
              try {
                await refreshAccessToken();
              } catch {
                // ignore refresh retry failure
              }
            }
          }
        }
      }

      if (!user && !profileHydrateAttemptedRef.current) {
        profileHydrateAttemptedRef.current = true;
        try {
          await restoreSession({ force: true });
        } catch {
          // Ignore restore failures here. RequireAuth/AuthContext handle invalid sessions.
        }
        if (!active) return;
        return;
      }

      if (!user) {
        clearBusinessRegistrationHints();
        router.replace("/auth/business-register");
        return;
      }

      const hasBusinessInProfile = hasBusinessRegistration(user);
      if (!hasBusinessInProfile) {
        clearBusinessRegistrationHints();
        router.replace("/auth/business-register");
        return;
      }

      const hasBusinessCookie = getCookie("business_registered") === "true";
      if (!hasBusinessCookie) {
        setCookie("business_registered", "true", {
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        });
      }

      setSessionChecked(true);
    };

    void validate();
    return () => {
      active = false;
    };
  }, [isReady, isRestoring, restoreSession, router, status, user]);

  useEffect(() => {
    if (!isProfileOpen) return undefined;
    const onClickOutside = (event) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [isProfileOpen]);

  const handleVisitHomePage = () => {
    setIsProfileOpen(false);
    window.location.href = getListingAppUrl("/home");
  };

  const handleLogout = async () => {
    setIsProfileOpen(false);
    try {
      await logoutPanelSession();
    } catch {}
    await logout({ redirect: false });
    window.location.href = getAuthLoginUrl({
      returnTo: getListingAppUrl("/home"),
      source: "main-app",
    });
  };

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Preparing dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(199,154,43,0.18),transparent_60%),linear-gradient(180deg,#fffdf7_0%,#f8f4ea_100%)]">
      <header className="sticky top-0 z-20 border-b border-[#e6dcc7] bg-[#fffaf0]/95 backdrop-blur">
        <div className="mx-auto flex h-[84px] w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLogo
            size={48}
            titleClass="text-[#1f2a44] text-lg font-semibold"
            subtitleClass="text-[#8a6b2f] text-xs"
            compact
          />

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsProfileOpen((open) => !open)}
              className="flex items-center gap-3 rounded-full border border-[#d9c79f] bg-white px-3 py-2 shadow-sm transition hover:border-[#c79a2b]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1f2a44] text-sm font-semibold text-[#f8d98f]">
                {userInitial}
              </span>
              <span className="hidden text-sm font-medium text-[#1f2a44] sm:block">{userName}</span>
            </button>

            {isProfileOpen ? (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[#dbc9a2] bg-white p-2 shadow-[0_12px_30px_rgba(48,40,20,0.18)]">
                <button
                  type="button"
                  onClick={handleVisitHomePage}
                  className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[#1f2a44] transition hover:bg-[#fbf4e2]"
                >
                  Visit Home Page
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[#9b2c2c] transition hover:bg-[#fff1eb]"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-6xl items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-3xl border border-[#e2d1ac] bg-[linear-gradient(180deg,#fffef9_0%,#fff8e8_100%)] px-6 py-16 text-center shadow-[0_18px_40px_rgba(84,67,28,0.12)] sm:px-10 sm:py-24">
          <h1 className="bg-[linear-gradient(180deg,#a87b19_0%,#6b4f13_100%)] bg-clip-text text-4xl font-black tracking-[0.08em] text-transparent sm:text-6xl md:text-7xl">
            FEATURES COMING SOON
          </h1>
          <p className="mt-6 text-sm font-medium tracking-[0.16em] text-[#7a6332] sm:text-base">
            BROKER DASHBOARD EXPERIENCE IN PROGRESS
          </p>
        </section>
      </main>
    </div>
  );
}
