"use client";

import { useState, useCallback } from "react";
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
import { setJsonCookie } from "@/services/cookie";

const LANG_MAP = { eng, guj, hindi };

export default function LoginPage() {
  const router = useRouter();

  const [language, setLanguage] = useState("eng");
  const [mobile, setMobile] = useState("");
  const [country, setCountry] = useState(phoneCodes[0]);
  const [method, setMethod] = useState("whatsapp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const t = LANG_MAP[language] || eng;

  const isValidMobile = /^\d{10}$/.test(mobile);

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
        purpose: 0,
        via: method,
      };

      // store OTP context for next step
      setJsonCookie("otp_context", context, { maxAge: 300 });

      // trigger OTP
      await sendOtp({ via: method });

      router.push("/auth/otp");
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to send OTP";

      setError(message);
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
