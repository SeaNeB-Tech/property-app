"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import phoneCodes from "@/constants/phoneCodes.json";

// i18n
import eng from "@/constants/i18/eng/login.json";
import guj from "@/constants/i18/guj/login.json";
import hindi from "@/constants/i18/hindi/login.json";

// UI
import AuthCard from "@/components/ui/AuthCard";
import AuthHeader from "@/components/ui/AuthHeader";
import Button from "@/components/ui/Button";
import PhoneInput from "@/components/ui/PhoneInput";

// Service
import { sendOtp } from "@/app/auth/auth-service/otp.service";
import { clearPreAuthCsrfCookies, getCookie, removeCookie, setCookie, setJsonCookie } from "@/services/auth.service";
import { getListingAppUrl } from "@/lib/core/appUrls";
import useAuthSubmitTransition from "@/hooks/useAuthSubmitTransition";
import {
  getAllowedReturnOrigins,
  getPrimaryListingOrigin,
  redirectToListingWithBridgeToken,
} from "@/lib/postLoginRedirect";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getAuthFlowContext,
  ingestAuthFlowContextFromWindowName,
  ingestAuthFlowContextFromUrl,
  setAuthFlowContext,
  stripAuthFlowParamsFromAddressBar,
} from "@/lib/auth/flowContext";

const LANG_MAP = { eng, guj, hindi };
const LANGUAGE_STORAGE_KEY = "auth_language";
const RETURN_TO_COOKIE = "auth_return_to";
const POST_OTP_VERIFIED_COOKIE = "post_otp_verified";
// The current auth entry flow uses the shared signup/login OTP purpose.
// The backend complete-profile/signup handoff still depends on this value.
const PURPOSE_LOGIN = 0;
const MAIN_APP_REGISTER_SOURCE = "main-app-register";

const isSafeReturnTo = (value) => {
  const target = String(value || "").trim();
  const listingAppOrigin = getPrimaryListingOrigin();
  const allowedReturnOrigins = getAllowedReturnOrigins();
  if (!target) return false;
  if (target.startsWith("/")) return true;

  try {
    const parsed = new URL(target);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (allowedReturnOrigins.length) return allowedReturnOrigins.includes(parsed.origin);
    if (listingAppOrigin) return parsed.origin === listingAppOrigin;
    if (typeof window === "undefined") return true;
    return parsed.hostname === window.location.hostname;
  } catch {
    return false;
  }
};

const getPostLoginTarget = () => {
  const flowTarget = String(getAuthFlowContext()?.returnTo || "").trim();
  if (isSafeReturnTo(flowTarget)) return flowTarget;

  const cookieTarget = String(getCookie(RETURN_TO_COOKIE) || "").trim();
  if (isSafeReturnTo(cookieTarget)) return cookieTarget;

  return getListingAppUrl("/home");
};

const resolveRedirectTarget = (target) => {
  const safeTarget = String(target || "").trim();
  if (!safeTarget) return getListingAppUrl("/home");
  if (/^https?:\/\//i.test(safeTarget)) return safeTarget;
  if (safeTarget.startsWith("/dashboard")) return safeTarget;
  return safeTarget;
};

const isCrossOriginAbsoluteTarget = (value) => {
  const target = String(value || "").trim();
  if (!target || target.startsWith("/")) return false;
  try {
    if (typeof window === "undefined") return false;
    const parsed = new URL(target);
    return parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
};

const getFriendlyOtpError = (err) => {
  const status = Number(err?.response?.status || 0);
  const backendMessage =
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    "";
  const waitSeconds = Number(
    err?.response?.data?.error?.wait_seconds ||
      err?.response?.data?.wait_seconds ||
      err?.response?.data?.waitSeconds ||
      0
  );
  const code = String(err?.response?.data?.code || err?.response?.data?.error?.code || "")
    .trim()
    .toUpperCase();

  // Prefer *only* backend-provided messages for OTP throttling / resend attempts.
  if (String(backendMessage || "").trim()) return String(backendMessage).trim();
  if (String(code || "").trim()) return String(code).trim();
  if (Number.isFinite(waitSeconds) && waitSeconds > 0) return "";
  if (status === 429) return "";

  if (status === 400 || status === 401 || status === 403 || status === 422) {
    return "Unable to send OTP. Please check your number and try again.";
  }

  if (status >= 500) {
    return backendMessage || "Something went wrong";
  }

  return backendMessage || String(err?.message || "").trim() || "Something went wrong";
};

export default function LoginContent({ initialHold = false } = {}) {
  const router = useRouter();
  const { authInitialized, isAuthenticated, isLoading } = useAuth();

  const [language, setLanguage] = useState(() => {
    if (typeof window !== "undefined") {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage && LANG_MAP[savedLanguage]) {
        return savedLanguage;
      }
    }
    return "eng";
  });
  const [mobile, setMobile] = useState("");
  const [country, setCountry] = useState(phoneCodes[0]);
  const [method, setMethod] = useState("whatsapp");
  const [error, setError] = useState("");
  const flowContextRef = useRef({ source: "", returnTo: "" });
  const { isTransitioning, runWithTransition } = useAuthSubmitTransition();
  const readFlowContext = useCallback(() => {
    const current = flowContextRef.current || { source: "", returnTo: "" };
    return {
      source: String(current.source || "").trim().toLowerCase(),
      returnTo: String(current.returnTo || "").trim(),
    };
  }, []);

  const t = LANG_MAP[language] || eng;

  const isValidMobile = /^\d{10}$/.test(mobile);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (LANG_MAP[language]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    ingestAuthFlowContextFromWindowName();
    const nextContext = ingestAuthFlowContextFromUrl();
    flowContextRef.current = nextContext || { source: "", returnTo: "" };
    stripAuthFlowParamsFromAddressBar();

    const returnTo = String(nextContext?.returnTo || "").trim();
    if (returnTo && isSafeReturnTo(returnTo)) {
      setCookie(RETURN_TO_COOKIE, returnTo, { maxAge: 10 * 60, path: "/" });
    }
  }, []);

  useEffect(() => {
    let active = true;

    const maybeRedirect = async () => {
      if (!authInitialized || !isAuthenticated) return;
      const { source, returnTo } = readFlowContext();
      const target = (() => {
        if (returnTo && isSafeReturnTo(returnTo)) return returnTo;
        return resolveRedirectTarget(getPostLoginTarget());
      })();

      if (isCrossOriginAbsoluteTarget(target)) {
        const redirected = await redirectToListingWithBridgeToken({
          returnTo: target,
          source,
        });
        if (!active) return;
        if (redirected) return;
      }
      router.replace(target);
    };

    void maybeRedirect();

    return () => {
      active = false;
    };
  }, [authInitialized, isAuthenticated, readFlowContext, router]);

  useEffect(() => {
    let active = true;

    const otpInProgress = String(getCookie("otp_in_progress") || "").trim().toLowerCase();
    const postOtpVerified = String(getCookie(POST_OTP_VERIFIED_COOKIE) || "").trim().toLowerCase();
    const shouldPreserveForOtpFlow =
      otpInProgress === "1" ||
      otpInProgress === "true" ||
      otpInProgress === "yes" ||
      postOtpVerified === "1" ||
      postOtpVerified === "true" ||
      postOtpVerified === "yes";

    // Keep login form clean and never auto-probe /profile/me from login page.
    Promise.resolve().finally(() => {
      if (!active) return;
      if (!shouldPreserveForOtpFlow) {
        // Never delete backend-issued csrf_token_property here.
        // Removing it breaks refresh/session recovery and causes login loops.
        clearPreAuthCsrfCookies();
      } else {
        // Stale post-OTP marker should not force repeated login-side checks.
        removeCookie(POST_OTP_VERIFIED_COOKIE);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const handleContinue = useCallback(async () => {
    if (!isValidMobile || isTransitioning) return;
    setError("");

    await runWithTransition(
      async () => {
        const { source, returnTo } = readFlowContext();
        const dialCode = country?.dialCode?.replace("+", "");

        if (!dialCode) {
          throw new Error("Invalid country code");
        }

        const context = {
          country_code: dialCode,
          mobile_number: mobile,
          purpose: PURPOSE_LOGIN,
          via: method,
        };

        setJsonCookie("otp_context", context, { maxAge: 300 });
        setCookie("otp_in_progress", "1", { maxAge: 10 * 60, path: "/" });

        await sendOtp({ via: method });

        const resolvedReturnTo = (() => {
          if (source === MAIN_APP_REGISTER_SOURCE && returnTo && isSafeReturnTo(returnTo)) {
            return returnTo;
          }
          return resolveRedirectTarget(getPostLoginTarget());
        })();

        return resolvedReturnTo;
      },
      {
        onSuccess: (returnTo) => {
          const { source } = readFlowContext();
          setAuthFlowContext({ source, returnTo: String(returnTo || "").trim() });
          router.replace("/auth/otp");
        },
        onError: (err) => {
          console.error("sendOtp failed:", err);
          setError(getFriendlyOtpError(err));
        },
      }
    );
  }, [country, isTransitioning, isValidMobile, method, mobile, readFlowContext, router, runWithTransition]);

  const shouldHoldUi = Boolean(initialHold) && (!authInitialized || isLoading || isAuthenticated);

  if (shouldHoldUi) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-white"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 text-center shadow-sm">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
          <p className="text-sm text-slate-500">Preparing session...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthCard
      header={
        <AuthHeader
          language={language}
          setLanguage={setLanguage}
        />
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleContinue();
        }}
      >
        <h1 className="text-xl font-semibold text-black mb-1">
          {t.login}
        </h1>

        <p className="text-sm text-gray-500 mb-6">
          {t.subtitle}
        </p>

        <PhoneInput
          t={t}
          mobile={mobile}
          setMobile={setMobile}
          country={country}
          setCountry={setCountry}
        />

        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-10">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={method === "whatsapp"}
                onChange={() => setMethod("whatsapp")}
              />
              {t.viaWhatsapp}
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={method === "sms"}
                onChange={() => setMethod("sms")}
              />
              {t.viaSms}
            </label>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 mb-3">
            {error}
          </p>
        )}

        <Button
          type="submit"
          label={t.continue}
          loading={isTransitioning}
          disabled={!isValidMobile || isTransitioning}
        />
      </form>
    </AuthCard>
  );
}
