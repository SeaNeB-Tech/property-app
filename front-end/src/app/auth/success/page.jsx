"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AuthHeader from "@/components/ui/AuthHeader";
import { redirectToListingWithBridgeToken } from "@/lib/postLoginRedirect";
import { getListingAppUrl } from "@/lib/core/appUrls";
import eng from "@/constants/i18/eng/common.json";
import guj from "@/constants/i18/guj/common.json";
import hindi from "@/constants/i18/hindi/common.json";

//  Client-only Lottie (SSR disabled)
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const LANG_MAP = { eng, guj, hindi };
const LANGUAGE_STORAGE_KEY = "auth_language";

export default function SuccessPage() {
  const [animationData, setAnimationData] = useState(null);
  const [redirecting, setRedirecting] = useState(false);
  const [handoffError, setHandoffError] = useState("");
  const [language, setLanguage] = useState(() => {
    if (typeof window !== "undefined") {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage && LANG_MAP[savedLanguage]) {
        return savedLanguage;
      }
    }
    return "eng";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (LANG_MAP[language]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language]);

  useEffect(() => {
    let mounted = true;

    fetch("/Lottie/success.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load Lottie JSON");
        }
        return res.json();
      })
      .then((data) => {
        if (mounted) {
          console.log(" Lottie JSON loaded");
          setAnimationData(data);
        }
      })
      .catch((err) => {
        console.error(" Lottie load error:", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const buildDefaultReturnTo = () => {
    return getListingAppUrl("/home");
  };

  const handleContinue = useCallback(async () => {
    if (redirecting) return;
    setRedirecting(true);
    setHandoffError("");
    const target = buildDefaultReturnTo();
    try {
      const redirected = await redirectToListingWithBridgeToken({
        returnTo: target,
      });
      if (!redirected) {
        throw new Error("Unable to redirect. Please try again.");
      }
    } catch (err) {
      setHandoffError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to continue. Please try again."
      );
      setRedirecting(false);
    }
  }, [redirecting]);

  useEffect(() => {
    if (!animationData) return;
    const timer = window.setTimeout(() => {
      void handleContinue();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [animationData, handleContinue]);

  return (
    <div className="auth-shell auth-shell--compact min-h-screen w-full flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 px-6 sm:px-8 py-6 sm:py-8 w-full max-w-[420px] text-center">
        <div className="mb-4 text-left">
          <AuthHeader language={language} setLanguage={setLanguage} />
        </div>

        {/* BIG & CONTINUOUS ANIMATION */}
        <div className="flex justify-center items-center mb-8">
          {animationData ? (
            <Lottie
              key="success-animation"
              animationData={animationData}
              autoplay
              loop={true}              
              renderer="svg"
              style={{
                width: 220,           
                height: 220,
              }}
            />
          ) : (
            <div style={{ width: 220, height: 220 }} />
          )}
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Registration Successful
        </h1>

        <p className="text-sm text-gray-500 mb-8">
          Your profile has been completed successfully.
        </p>

        {handoffError ? (
          <p className="mb-3 text-sm text-red-700">{handoffError}</p>
        ) : null}

        <button
          onClick={() => void handleContinue()}
          className="w-full bg-[#8b5a00] hover:bg-[#734900] text-white py-3 rounded-lg font-medium transition"
        >
          {redirecting ? "Redirecting..." : "Go to Home"}
        </button>
      </div>
    </div>
  );
}
