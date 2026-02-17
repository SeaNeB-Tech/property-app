"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import eng from "@/constants/i18/eng/otp.json";
import guj from "@/constants/i18/guj/otp.json";
import hindi from "@/constants/i18/hindi/otp.json";

import AuthCard from "@/components/ui/AuthCard";
import AuthHeader from "@/components/ui/AuthHeader";
import Button from "@/components/ui/Button";
import OtpInput from "@/components/ui/OtpInput";

import useOtp from "@/hooks/useotp";
import { getJsonCookie, removeCookie, setCookie } from "@/services/cookie";

const LANG_MAP = { eng, guj, hindi };

export default function VerifyOtp() {
  const router = useRouter();
  const params = useSearchParams();

  const [language, setLanguage] = useState(params.get("lang") || "eng");
  const t = LANG_MAP[language] || eng;

  const [otp, setOtp] = useState("");
  const [navigating, setNavigating] = useState(false);

  const otpContext = getJsonCookie("otp_context");

  useEffect(() => {
    if (!otpContext) {
      router.replace("/auth/login");
    }
  }, [otpContext, router]);

  const {
    verify,
    resend,
    loading,
    resending,
    infoMessage,
    cooldown,
    isEmail,
  } = useOtp({
    t,
    onSuccess: async (data) => {
      if (navigating) return;
      setNavigating(true);

      console.log("\n [OtpVerification] OTP Verification Successful");
      console.log("   Response data:", data);

      // OTP verified — backend sets HttpOnly refresh cookie
      removeCookie("otp_context");

      // Debug: show cookies/state before redirecting
      try {
        const accessToken = data?.access_token;
        const csrfToken = data?.csrf_token;
        console.log("\n [OtpVerification] Token Summary Before Redirect:");
        console.log("   Access Token: " + (accessToken ? " Present" : " Missing"));
        console.log("   CSRF Token: " + (csrfToken ? " Present" : " Missing"));
        console.log("   Cookies: " + (document.cookie ? " " + document.cookie.length + " bytes" : " Empty"));
      } catch (e) {}

      // EXISTING USER
      if (data?.user_exists === true) {
        setCookie("profile_completed", "true", {
          maxAge: 60 * 60 * 24 * 7,
        });

        console.log("\n [OtpVerification] Existing User - Case B");
        console.log("   → Session created, tokens received");
        console.log("   → Redirecting to /dashboard");
        router.replace("/dashboard");
        return;
      }

      // NEW USER
      console.log("\n [OtpVerification] New User - Case A");
      console.log("   → Session NOT created, tokens NOT received");
      console.log("   → Redirecting to /auth/complete-profile");
      router.replace("/auth/complete-profile");
    },
  });

  if (!otpContext) return null;

  const subtitle = isEmail
    ? `OTP sent to ${otpContext.email}`
    : `OTP sent to +${otpContext.country_code} ${otpContext.mobile_number}`;

  return (
    <AuthCard>
      <AuthHeader language={language} onLanguageChange={setLanguage} />

      <h2>{t.otpTitle}</h2>
      <p>{subtitle}</p>

      <OtpInput length={4} onChange={setOtp} />

      <Button
        disabled={otp.length !== 4 || loading}
        onClick={() => verify(otp)}
      >
        {loading ? t.verifying : t.verifyOtp}
      </Button>

      {infoMessage && <p>{infoMessage}</p>}

      <button disabled={cooldown > 0 || resending} onClick={() => resend()}>
        {cooldown > 0 ? `Resend in ${cooldown}s` : t.resendOtp}
      </button>
    </AuthCard>
  );
}
