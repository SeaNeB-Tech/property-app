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
import AuthTransitionOverlay from "@/components/ui/AuthTransitionOverlay";

// Services
import { sendOtp, verifyOtp } from "@/app/auth/auth-service/otp.service";
import { ensureSessionReady } from "@/app/auth/auth-service/auth.bootstrap";
import { getJsonCookie, setCookie, setJsonCookie, removeCookie } from "@/services/auth.service";
import { getAuthAppUrl } from "@/lib/core/appUrls";
import useAuthSubmitTransition from "@/hooks/useAuthSubmitTransition";
import { notifyAuthChanged } from "@/services/auth.service";
import { redirectToListingWithBridgeToken } from "@/lib/postLoginRedirect";
import {
  clearAuthFlowContext,
  getAuthFlowContext,
  ingestAuthFlowContextFromUrl,
  stripAuthFlowParamsFromAddressBar,
} from "@/lib/auth/flowContext";

const LANG_MAP = { eng, guj, hindi };
const PURPOSE_BUSINESS_MOBILE_VERIFY = 2;
const PURPOSE_SIGNUP_OR_LOGIN = 0;
const LANGUAGE_STORAGE_KEY = "auth_language";
const POST_OTP_VERIFIED_COOKIE = "post_otp_verified";
const MAIN_APP_LOGIN_SOURCE = "main-app";
const MAIN_APP_REGISTER_SOURCE = "main-app-register";
const RESEND_COOLDOWN_SECONDS = 60;

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

const readBoolFromPayload = (payload = {}, keys = []) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.payload,
    payload?.response,
    payload?.session,
    payload?.tokens,
    payload?.data?.session,
    payload?.data?.tokens,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    for (const key of keys) {
      const value = candidate?.[key];
      if (typeof value === "boolean") return value;
      const normalized = String(value ?? "").trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(normalized)) return true;
      if (["false", "0", "no", "n"].includes(normalized)) return false;
    }
  }

  return null;
};

export default function OtpPage() {
  const router = useRouter();
  const [status, setStatus] = useState("verifying");

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
  const [infoMessage, setInfoMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [otpClearSignal, setOtpClearSignal] = useState(0);
  const [otpVia, setOtpVia] = useState("whatsapp");
  const verifyInFlightRef = useRef(false);
  const { isTransitioning, showTransition, runWithTransition, stopTransition } = useAuthSubmitTransition();

  useEffect(() => {
    ingestAuthFlowContextFromUrl();
    stripAuthFlowParamsFromAddressBar();
  }, []);

  const handleOtpSuccess = async ({ sourcePayload = null } = {}) => {
    const { source, returnTo } = getAuthFlowContext();
    const localTarget = String(returnTo || "").trim();
    if (localTarget === "/dashboard" || localTarget.startsWith("/dashboard/")) {
      clearAuthFlowContext();
      router.replace(localTarget);
      return;
    }

    try {
      const fallbackReturnTo =
        source === MAIN_APP_REGISTER_SOURCE
          ? "/auth/business-register"
          : source === MAIN_APP_LOGIN_SOURCE
            ? "/home"
            : "/dashboard";
      const redirected = await redirectToListingWithBridgeToken({
        returnTo: returnTo || fallbackReturnTo,
        source,
        sourcePayload,
      });
      if (!redirected) {
        throw new Error("Unable to redirect. Please try again.");
      }
      clearAuthFlowContext();
    } catch (err) {
      setStatus("error");
      setInfoMessage(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to continue. Please try again."
      );
    }
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
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);


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
  }, [router]);


  const handleVerify = async () => {
    if (!isValid || isTransitioning || verifyInFlightRef.current) return;

    verifyInFlightRef.current = true;
    setStatus("verifying");
    setInfoMessage("");

    try {
      await runWithTransition(
        async () => {
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

          const response = await verifyOtp({ otp });
          return { response, ctx: getJsonCookie("otp_context"), contextSnapshot };
        },
        {
          onSuccess: async ({ response, ctx, contextSnapshot }) => {
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

            const payload = response?.data || {};
            const verifySucceeded =
              (Number(response?.status || 0) >= 200 && Number(response?.status || 0) < 300) ||
              payload?.ok === true ||
              payload?.success === true;

            if (!verifySucceeded) {
              setInfoMessage("Unable to verify OTP right now. Please try again.");
              setStatus("error");
              stopTransition();
              return;
            }

            const isExistingUserField = readBoolFromPayload(payload, ["is_existing_user", "isExistingUser"]);
            const userExistsField = readBoolFromPayload(payload, ["user_exists", "userExists", "existing_user"]);
            const profileCompletedField = readBoolFromPayload(payload, ["profile_completed", "profileCompleted"]);
            const requiresRegistrationField = readBoolFromPayload(payload, [
              "requires_registration",
              "requiresRegistration",
              "needs_profile_completion",
              "needsProfileCompletion",
              "is_new_user",
              "isNewUser",
            ]);
            const isExistingUser =
              isExistingUserField === true ||
              userExistsField === true ||
              profileCompletedField === true;
            const requiresRegistration =
              requiresRegistrationField === true ? true : !isExistingUser;

            if (requiresRegistration) {
              // Treat the first successful login OTP as signup-mobile verification proof.
              setJsonCookie(
                "signup_otp_verified",
                {
                  country_code: String(contextSnapshot.country_code),
                  mobile_number: String(contextSnapshot.mobile_number),
                  purpose: PURPOSE_SIGNUP_OR_LOGIN,
                  verified_at: Date.now(),
                },
                { maxAge: 60 * 60 * 24 * 7, path: "/" }
              );
              setCookie(POST_OTP_VERIFIED_COOKIE, "1", { maxAge: 60 * 60 * 24 * 7, path: "/" });
              removeCookie("otp_in_progress");
              removeCookie("otp_context");
              router.replace("/auth/complete-profile");
              return;
            }

            removeCookie("otp_in_progress");
            removeCookie("otp_context");
            setCookie(POST_OTP_VERIFIED_COOKIE, "1", { maxAge: 180, path: "/" });
            setCookie("profile_completed", "true", {
              maxAge: 60 * 60 * 24 * 7,
            });
            const sessionReady = await ensureSessionReady({ force: true });
            if (!sessionReady) {
              throw new Error("Session is not ready after OTP verification. Please login again.");
            }
            notifyAuthChanged();
            setStatus("verified");
            stopTransition();
            void handleOtpSuccess({ sourcePayload: payload });
          },
          onError: (err) => {
            console.error("OTP verify failed:", err);
            const friendly = getFriendlyVerifyError(err);
            setInfoMessage(friendly.message);
            setStatus("error");
            if (friendly.clearOtp) {
              setOtp("");
              setOtpClearSignal((value) => value + 1);
            }
            if (friendly.redirectLogin) {
              removeCookie("otp_in_progress");
              removeCookie("otp_context");
              router.replace(getAuthAppUrl("/auth/login"));
            }
          },
        }
      );
    } finally {
      verifyInFlightRef.current = false;
    }
  };


  const handleResend = async (requestedChannel) => {
    if (resending || resendCooldown > 0) return;

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
      setInfoMessage(`OTP resent via ${channel === "sms" ? "SMS" : "WhatsApp"}.`);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setInfoMessage("Unable to resend OTP right now. Please try again.");
    } finally {
      setResending(false);
    }
  };


  if (status === "verifying" && showTransition) {
    return (
      <AuthTransitionOverlay
        title="Verifying OTP..."
        description="Checking your code and preparing your session."
      />
    );
  }

  if (status === "verified") {
    return (
      <AuthOtpCard
        header={
          <AuthHeader
            language={language}
            setLanguage={setLanguage}
          />
        }
      >
        <div className="flex flex-col items-center text-center py-8">
          <div className="h-16 w-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M20 7L10 17L5 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-lg font-semibold text-black">
            OTP Verified Successfully
          </h1>
          <button
            type="button"
            onClick={() => void handleOtpSuccess()}
            className="mt-6 w-full rounded-lg bg-[#8b5a00] py-3 font-medium text-white hover:bg-[#734900] transition"
          >
            Explore SeaNeB
          </button>
        </div>
      </AuthOtpCard>
    );
  }

  return (
    <AuthOtpCard
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
          void handleVerify();
        }}
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
            type="submit"
            label={t.verifyOtp || "Verify OTP"}
            loading={isTransitioning}
            disabled={!isValid || isTransitioning}
          />
        </div>
      </form>

      <div className="text-center mt-4 text-sm">
        {resendCooldown > 0 ? (
          <p className="mb-2 text-xs text-gray-500">
            Resend available in {String(Math.floor(resendCooldown / 60)).padStart(2, "0")}:
            {String(resendCooldown % 60).padStart(2, "0")}
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => handleResend("whatsapp")}
            disabled={resending || resendCooldown > 0}
            className={`${
              resending || resendCooldown > 0 ? "text-gray-400" : "text-blue-600 hover:text-blue-700"
            }`}
          >
            Resend via WhatsApp
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={() => handleResend("sms")}
            disabled={resending || resendCooldown > 0}
            className={`${
              resending || resendCooldown > 0 ? "text-gray-400" : "text-blue-600 hover:text-blue-700"
            }`}
          >
            Resend via SMS
          </button>
        </div>
      </div>
    </AuthOtpCard>
  );
}

