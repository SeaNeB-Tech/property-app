"use client";

import { useState, useCallback, useEffect } from "react";
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
import { clearPreAuthCsrfCookies, getCookie, removeCookie, setCookie, setJsonCookie } from "@/services/cookie";
import api from "@/lib/api/client";
import { getListingAppUrl } from "@/lib/appUrls";

const LANG_MAP = { eng, guj, hindi };
const LANGUAGE_STORAGE_KEY = "auth_language";
const RETURN_TO_COOKIE = "auth_return_to";
const POST_OTP_VERIFIED_COOKIE = "post_otp_verified";
const PURPOSE_LOGIN = 1;

const isSafeReturnTo = (value) => {
  const target = String(value || "").trim();
  if (!target) return false;
  if (target.startsWith("/")) return true;

  try {
    const parsed = new URL(target);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (typeof window === "undefined") return true;
    return parsed.hostname === window.location.hostname;
  } catch {
    return false;
  }
};

const getPostLoginTarget = () => {
  if (typeof window === "undefined") return getListingAppUrl("/dashboard");

  const queryTarget = String(new URLSearchParams(window.location.search).get("returnTo") || "").trim();
  if (isSafeReturnTo(queryTarget)) return queryTarget;

  const cookieTarget = String(getCookie(RETURN_TO_COOKIE) || "").trim();
  if (isSafeReturnTo(cookieTarget)) return cookieTarget;

  return getListingAppUrl("/dashboard");
};

const resolveRedirectTarget = (target) => {
  const safeTarget = String(target || "").trim();
  if (!safeTarget) return getListingAppUrl("/dashboard");
  if (/^https?:\/\//i.test(safeTarget)) return safeTarget;
  if (safeTarget.startsWith("/dashboard")) return getListingAppUrl(safeTarget);
  return safeTarget;
};

const getFriendlyOtpError = (err) => {
  const status = Number(err?.response?.status || 0);

  if (status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (status === 400 || status === 401 || status === 403 || status === 422) {
    return "Unable to send OTP. Please check your number and try again.";
  }

  if (status >= 500) {
    return "Something went wrong on our side. Please try again shortly.";
  }

  return "Unable to send OTP right now. Please try again.";
};

export default function LoginPage() {
  const router = useRouter();

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    const params = new URLSearchParams(window.location.search);
    const returnTo = String(params.get("returnTo") || "").trim();
    if (!returnTo) return;
    setCookie(RETURN_TO_COOKIE, returnTo, { maxAge: 10 * 60, path: "/" });
  }, []);

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
    if (!isValidMobile || loading) return;

    setLoading(true);
    setError("");

    try {
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

      // store OTP context for next step
      setJsonCookie("otp_context", context, { maxAge: 300 });
      setCookie("otp_in_progress", "1", { maxAge: 10 * 60, path: "/" });

      // trigger OTP
      await sendOtp({ via: method });
      const until = Date.now() + 60 * 1000;
      setCookie("mobile_otp_until", String(until), { maxAge: 60, path: "/" });

      const returnTo = encodeURIComponent(resolveRedirectTarget(getPostLoginTarget()));
      router.push(`/auth/otp?returnTo=${returnTo}`);
    } catch (err) {
      console.error("sendOtp failed:", err);
      setError(getFriendlyOtpError(err));
    } finally {
      setLoading(false);
    }
  }, [isValidMobile, loading, country, mobile, method, router]);

  return (
    <AuthCard
      header={
        <AuthHeader
          language={language}
          setLanguage={setLanguage}
        />
      }
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
        label={t.continue}
        loading={loading}
        disabled={!isValidMobile || loading}
        onClick={handleContinue}
      />
    </AuthCard>
  );
}
