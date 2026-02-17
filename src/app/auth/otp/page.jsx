"use client";

import { useEffect, useState } from "react";
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
import { getJsonCookie, setCookie, setJsonCookie, removeCookie } from "@/services/cookie";

const LANG_MAP = { eng, guj, hindi };
const PURPOSE_BUSINESS_MOBILE_VERIFY = 2;

export default function OtpPage() {
  const router = useRouter();

  const [language, setLanguage] = useState("eng");
  const [otp, setOtp] = useState("");
  const [mobileLabel, setMobileLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [otpClearSignal, setOtpClearSignal] = useState(0);

  const t = LANG_MAP[language] || eng;
  const isValid = otp.length === 4;


  useEffect(() => {
    const ctx = getJsonCookie("otp_context");
    if (!ctx) {
      router.replace("/auth/login");
      return;
    }

    if (ctx.country_code && ctx.mobile_number) {
      setMobileLabel(`+${ctx.country_code} ${ctx.mobile_number}`);
    }
  }, [router]);


  const handleVerify = async () => {
    if (!isValid || loading) return;

    try {
      setLoading(true);
      setInfoMessage("");

      const result = await verifyOtpAndLogin({ otp });

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

      // remove ephemeral OTP context
      removeCookie("otp_context");

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
        router.replace(redirectTo);
        return;
      }


      // EXISTING USER
      if (result?.isExistingUser === true) {
        setCookie("profile_completed", "true", {
          maxAge: 60 * 60 * 24 * 7,
        });


        router.replace("/dashboard");
        return;
      }

      // NEW USER

      router.replace("/auth/complete-profile");
    } catch (err) {
      console.error("OTP verify failed:", err);
      setInfoMessage(
        err?.response?.data?.message ||
        err?.message ||
        "Invalid OTP"
      );
      setOtp("");
      setOtpClearSignal((value) => value + 1);
    } finally {
      setLoading(false);
    }
  };


  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    try {
      setResending(true);
      setInfoMessage("");

      await sendOtp({ via: "whatsapp" });

      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setInfoMessage(err?.message || "Failed to resend OTP");
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
          <span
            onClick={handleResend}
            className={`cursor-pointer ${
              resending ? "text-gray-400" : "text-blue-600"
            }`}
          >
            {t.resendOtp || "Resend OTP"}
          </span>
        )}
      </div>
    </AuthOtpCard>
  );
}
