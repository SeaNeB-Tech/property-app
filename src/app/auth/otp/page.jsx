"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// i18n
import eng from "@/constants/i18/eng/otp.json";
import guj from "@/constants/i18/guj/otp.json";
import hindi from "@/constants/i18/hindi/otp.json";

// UI
import AuthOtpCard from "@/components/ui/AuthOtpCard";
import AuthHeader from "@/components/ui/AuthHeader";
import Button from "@/components/ui/Button";
import OtpInput from "@/components/ui/OtpInput";

// Services
import { verifyOtpAndLogin } from "@/app/auth/auth-service/authservice";
import { sendOtp } from "@/app/auth/auth-service/otp.service";
import { getJsonCookie, getCookie, setCookie, setJsonCookie, removeCookie } from "@/services/cookie";
import { getAuthAppUrl, getListingAppUrl } from "@/lib/appUrls";
import { redirectToOpenerOrSelf } from "@/lib/postLoginRedirect";

const LANG_MAP = { eng, guj, hindi };
const PURPOSE_BUSINESS_MOBILE_VERIFY = 2;
const MOBILE_OTP_UNTIL_COOKIE = "mobile_otp_until";
const LANGUAGE_STORAGE_KEY = "auth_language";
const RETURN_TO_COOKIE = "auth_return_to";
const POST_OTP_VERIFIED_COOKIE = "post_otp_verified";

const getFriendlyVerifyError = (err) => {
  const status = Number(err?.response?.status || 0);
  const code = String(
    err?.response?.data?.error?.code ||
      err?.response?.data?.code ||
      ""
  )
    .trim()
    .toUpperCase();
  const message = String(
    err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      ""
  )
    .trim()
    .toLowerCase();

  const isOtpError =
    status === 422 ||
    code.includes("OTP") ||
    message.includes("invalid otp") ||
    message.includes("otp invalid") ||
    message.includes("otp expired");

  if (isOtpError) {
    return { message: "Invalid OTP. Please try again.", clearOtp: true, redirectLogin: false };
  }

  if (status === 429) {
    return {
      message: "Too many attempts. Please wait and retry OTP.",
      clearOtp: false,
      redirectLogin: false,
    };
  }

  if (status === 401 || status === 403 || message.includes("session")) {
    return {
      message: "Session expired. Please login again and request OTP.",
      clearOtp: false,
      redirectLogin: true,
    };
  }

  if (status >= 500) {
    return {
      message: "Server error while verifying OTP. Please try again shortly.",
      clearOtp: false,
      redirectLogin: false,
    };
  }

  return {
    message: "Unable to verify OTP right now. Please try again.",
    clearOtp: false,
    redirectLogin: false,
  };
};

const isSafeReturnTo = (value) => {
  const target = String(value || "").trim();
  if (!target) return false;
  if (target.startsWith("/")) return true;

  try {
    const parsed = new URL(target);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (typeof window === "undefined") return true;
    return parsed.hostname === window.location.hostname;
  } catch {
    return false;
  }
};

const getPostLoginTarget = () => {
  if (typeof window === "undefined") return "";

  const queryTarget = String(new URLSearchParams(window.location.search).get("returnTo") || "").trim();
  if (isSafeReturnTo(queryTarget)) return queryTarget;

  const cookieTarget = String(getCookie(RETURN_TO_COOKIE) || "").trim();
  if (isSafeReturnTo(cookieTarget)) return cookieTarget;

  return "";
};

const resolveRedirectTarget = (target) => {
  const safeTarget = String(target || "").trim();
  if (!safeTarget) return getListingAppUrl("/home");
  if (/^https?:\/\//i.test(safeTarget)) return safeTarget;
  if (safeTarget.startsWith("/")) return getListingAppUrl(safeTarget);
  return getListingAppUrl("/home");
};


export default function OtpPage() {
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
  const [otp, setOtp] = useState("");
  const [mobileLabel, setMobileLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [otpClearSignal, setOtpClearSignal] = useState(0);
  const [otpVia, setOtpVia] = useState("whatsapp");
  const verifyInFlightRef = useRef(false);

  const redirectToPostLoginTarget = () => {
    const rawPostLoginTarget = getPostLoginTarget();
    const postLoginTarget = resolveRedirectTarget(rawPostLoginTarget);
    removeCookie(RETURN_TO_COOKIE);
    if (rawPostLoginTarget) {
      redirectToOpenerOrSelf(postLoginTarget);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  const t = LANG_MAP[language] || eng;
  const isValid = otp.length === 4;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (LANG_MAP[language]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language]);


  useEffect(() => {
    const ctx = getJsonCookie("otp_context");
    if (!ctx) {
      removeCookie("otp_in_progress");
      router.replace(getAuthAppUrl("/auth/login"));
      return;
    }

    setCookie("otp_in_progress", "1", { maxAge: 10 * 60, path: "/" });

    if (ctx.country_code && ctx.mobile_number) {
      setMobileLabel(`+${ctx.country_code} ${ctx.mobile_number}`);
    }

    setOtpVia(String(ctx.via || "whatsapp").toLowerCase() === "sms" ? "sms" : "whatsapp");

    const until = Number(getCookie(MOBILE_OTP_UNTIL_COOKIE) || 0);
    if (until > Date.now()) {
      setCooldown(Math.floor((until - Date.now()) / 1000));
    }
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((value) => {
        if (value <= 1) {
          removeCookie(MOBILE_OTP_UNTIL_COOKIE);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);


  const handleVerify = async () => {
    if (!isValid || loading || verifyInFlightRef.current) return;

    try {
      verifyInFlightRef.current = true;
      setLoading(true);
      setInfoMessage("");
      const contextSnapshot =
        getJsonCookie("otp_context") ||
        (mobileLabel
          ? {
              country_code: String((mobileLabel.split(" ")[0] || "").replace("+", "")).trim(),
              mobile_number: String(mobileLabel.split(" ").slice(1).join(" ")).trim(),
              purpose: 0,
              via: otpVia,
            }
          : null);

      if (!contextSnapshot?.country_code || !contextSnapshot?.mobile_number) {
        throw new Error("OTP context missing");
      }

      const result = await verifyOtpAndLogin({ otp, context: contextSnapshot });
      console.log("[otp] verify result:", result);

      //  OTP VERIFIED
      // Backend sets HttpOnly refresh cookie here
      const ctx = getJsonCookie("otp_context");

      // Mark mobile as verified (used by complete-profile guard)
      if (ctx?.mobile_number && ctx?.country_code) {
        setCookie("mobile_verified", "true", { maxAge: 60 * 60 * 24 * 7 });
        setCookie("otp_mobile", String(ctx.mobile_number), { maxAge: 60 * 60 * 24 * 7 });
        setCookie("otp_cc", String(ctx.country_code), { maxAge: 60 * 60 * 24 * 7 });
        setJsonCookie(
          "verified_mobile",
          { country_code: ctx.country_code, mobile_number: ctx.mobile_number },
          { maxAge: 60 * 60 * 24 * 7 }
        );
      }

      if (ctx?.purpose === PURPOSE_BUSINESS_MOBILE_VERIFY) {
        if (ctx?.mobile_number && ctx?.country_code) {
          setJsonCookie(
            "verified_business_mobile",
            {
              country_code: String(ctx.country_code),
              mobile_number: String(ctx.mobile_number),
            },
            { maxAge: 60 * 60 * 24 * 7, path: "/" }
          );
        }

        const redirectTo = String(ctx?.redirect_to || "/auth/business-register");
        removeCookie("otp_context");
        router.replace(redirectTo);
        return;
      }

      // NEW USER: do not call refresh/profile from OTP flow; continue onboarding.
      if (result?.requiresRegistration === true || result?.isExistingUser === false) {
        removeCookie("otp_in_progress");
        removeCookie("otp_context");
        router.replace("/auth/complete-profile");
        return;
      }

      // EXISTING USER
      if (!result?.sessionConfirmed) {
        setInfoMessage("OTP verified, but session setup failed. Please login again.");
        removeCookie("otp_in_progress");
        removeCookie("otp_context");
        setTimeout(() => {
          router.replace(getAuthAppUrl("/auth/login"));
        }, 900);
        return;
      }

      if (result?.isExistingUser === true) {
        removeCookie("otp_in_progress");
        removeCookie("otp_context");
        setCookie(POST_OTP_VERIFIED_COOKIE, "1", { maxAge: 180, path: "/" });
        setCookie("profile_completed", "true", {
          maxAge: 60 * 60 * 24 * 7,
        });
        redirectToPostLoginTarget();
        return;
      }

      // Fallback to onboarding if response is unexpected.
      removeCookie("otp_in_progress");
      removeCookie("otp_context");
      router.replace("/auth/complete-profile");
    } catch (err) {
      console.error("OTP verify failed:", err);
      const friendly = getFriendlyVerifyError(err);
      setInfoMessage(friendly.message);
      if (friendly.clearOtp) {
        setOtp("");
        setOtpClearSignal((value) => value + 1);
      }
      if (friendly.redirectLogin) {
        removeCookie("otp_in_progress");
        removeCookie("otp_context");
        setTimeout(() => {
          router.replace(getAuthAppUrl("/auth/login"));
        }, 800);
      }
    } finally {
      verifyInFlightRef.current = false;
      setLoading(false);
    }
  };


  const handleResend = async (requestedChannel) => {
    if (cooldown > 0 || resending) return;

    try {
      setResending(true);
      setInfoMessage("");

      const ctx = getJsonCookie("otp_context");
      const channel =
        String(requestedChannel || ctx?.via || otpVia || "whatsapp").toLowerCase() === "sms"
          ? "sms"
          : "whatsapp";
      setOtpVia(channel);
      setJsonCookie(
        "otp_context",
        {
          ...(ctx || {}),
          via: channel,
        },
        { maxAge: 300, path: "/" }
      );

      await sendOtp({ via: channel });

      const until = Date.now() + 60 * 1000;
      setCookie(MOBILE_OTP_UNTIL_COOKIE, String(until), { maxAge: 60, path: "/" });
      setCooldown(60);
      setInfoMessage(`OTP resent via ${channel === "sms" ? "SMS" : "WhatsApp"}.`);
    } catch (err) {
      setInfoMessage("Unable to resend OTP right now. Please try again.");
    } finally {
      setResending(false);
    }
  };


  return (
    <AuthOtpCard
      header={
        <AuthHeader
          language={language}
          setLanguage={setLanguage}
        />
      }
    >
      <h1 className="text-lg font-semibold text-black text-center">
        {t.otpTitle || "Verify OTP"}
      </h1>

      <p className="text-sm text-gray-500 text-center mt-1">
        {t.otpSubtitle || "Please enter the 4-digit code sent to"}{" "}
        <span className="text-black font-medium">
          {mobileLabel}
        </span>
        <br />
        <span className="text-xs text-gray-500">
          via {otpVia === "sms" ? "SMS" : "WhatsApp"}
        </span>
      </p>

      <div className="flex justify-center mt-6">
        <OtpInput length={4} onChange={setOtp} clearSignal={otpClearSignal} />
      </div>

      {infoMessage && (
        <p className="text-sm text-red-500 text-center mt-3">
          {infoMessage}
        </p>
      )}

      <div className="mt-6">
        <Button
          label={t.verifyOtp || "Verify OTP"}
          loading={loading}
          disabled={!isValid || loading}
          onClick={handleVerify}
        />
      </div>

      <div className="text-center mt-4 text-sm">
        {cooldown > 0 ? (
          <span className="text-gray-400">
            {t.resendIn || "Resend OTP in"} {cooldown}s
          </span>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleResend("whatsapp")}
              disabled={resending}
              className={`${
                resending ? "text-gray-400" : "text-blue-600 hover:text-blue-700"
              }`}
            >
              Resend via WhatsApp
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => handleResend("sms")}
              disabled={resending}
              className={`${
                resending ? "text-gray-400" : "text-blue-600 hover:text-blue-700"
              }`}
            >
              Resend via SMS
            </button>
          </div>
        )}
      </div>
    </AuthOtpCard>
  );
}
