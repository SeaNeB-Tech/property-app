"use client"

import { Suspense } from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

// i18n
import eng from "@/constants/i18/eng/otp.json"
import guj from "@/constants/i18/guj/otp.json"
import hindi from "@/constants/i18/hindi/otp.json"

// UI
import AuthCard from "@/components/ui/AuthCard"
import AuthHeader from "@/components/ui/AuthHeader"
import Button from "@/components/ui/Button"
import OtpInput from "@/components/ui/OtpInput"
import AuthTransitionOverlay from "@/components/ui/AuthTransitionOverlay"

// Services
import { verifyEmailOtp, sendEmailOtp } from "@/app/auth/auth-service/email.service"
import { getJsonCookie, removeCookie } from "@/services/auth.service"
import useAuthSubmitTransition from "@/hooks/useAuthSubmitTransition"

const LANG_MAP = { eng, guj, hindi }
const LANGUAGE_STORAGE_KEY = "auth_language"

export default function EmailOtpPage() {
  return (
    <Suspense fallback={null}>
      <EmailOtpContent />
    </Suspense>
  )
}

function EmailOtpContent() {
  const router = useRouter()

  const [language, setLanguage] = useState(() => {
    if (typeof window !== "undefined") {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      if (savedLanguage && LANG_MAP[savedLanguage]) {
        return savedLanguage
      }
    }
    return "eng"
  })
  const t = LANG_MAP[language] || eng

  const [otp, setOtp] = useState("")
  const [email, setEmail] = useState("")
  const [resending, setResending] = useState(false)
  const [infoMessage, setInfoMessage] = useState("")
  const [mounted, setMounted] = useState(false)
  const [otpPurpose, setOtpPurpose] = useState(1)
  const [redirectTo, setRedirectTo] = useState("/auth/complete-profile")
  const [otpClearSignal, setOtpClearSignal] = useState(0)
  const { isTransitioning, showTransition, runWithTransition } = useAuthSubmitTransition()

  const isValid = otp.length === 4

  useEffect(() => {
    if (typeof window === "undefined") return
    if (LANG_MAP[language]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    }
  }, [language])

  /* ================= INIT ================= */

  useEffect(() => {
    // Always trust cookie context and sanitize URL (no sensitive query params).
    const ctx = getJsonCookie("otp_context")

    setMounted(true)

    if (ctx?.email) {
      setEmail(ctx.email)
    } else {
      // No email context found - redirect back
      router.replace("/auth/complete-profile")
      return
    }

    if (ctx?.purpose) {
      setOtpPurpose(Number(ctx.purpose) || 1)
    }

    const nextRedirect = ctx?.redirect_to || "/auth/complete-profile"
    setRedirectTo(nextRedirect)

    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", "/auth/email-otp")
    }

  }, [router])

  /* ================= VERIFY OTP ================= */

  const handleVerify = async () => {
    if (!isValid || isTransitioning || !email) return

    setInfoMessage("")

    await runWithTransition(
      async () => {
        await verifyEmailOtp({ email, otp, purpose: otpPurpose })
      },
      {
        onSuccess: () => {
          if (otpPurpose === 3) {
            setCookie("verified_business_email", email, {
              maxAge: 60 * 60 * 24 * 7,
              path: "/",
            })
          } else {
            setCookie("verified_email", email, {
              maxAge: 60 * 60 * 24 * 7,
              path: "/",
            })
          }

          removeCookie("otp_context")
          router.replace(redirectTo)
        },
        onError: (err) => {
          console.error("Email OTP verification failed:", err)
          setInfoMessage("Invalid OTP. Please try again.")
          setOtp("")
          setOtpClearSignal((value) => value + 1)
        },
      }
    )
  }

  /* ================= RESEND OTP ================= */

  const handleResend = async () => {
    if (resending || !email) return

    try {
      setResending(true)
      setInfoMessage("")

      await sendEmailOtp({ email, purpose: otpPurpose })
      setInfoMessage("OTP sent to your email")
    } catch (err) {
      console.error("Resend OTP failed:", err)
      setInfoMessage("Unable to resend OTP right now. Please try again.")
    } finally {
      setResending(false)
    }
  }

  if (!mounted) return null
  if (showTransition) {
    return (
      <AuthTransitionOverlay
        title="Verifying Email OTP..."
        description="Confirming your email and returning you to the form."
      />
    )
  }

  return (
    <AuthCard header={<AuthHeader language={language} setLanguage={setLanguage} />}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void handleVerify()
        }}
      >
        <h1 className="text-2xl font-semibold">{t.otpTitle || "Verify Email"}</h1>
        <p className="text-sm text-gray-500 mt-2">
          {t.otpSubtitle || "Please enter the 4-digit code sent to"}
          <br />
          <span className="text-black font-medium">{email}</span>
        </p>

        <div className="flex justify-center mt-6">
          <OtpInput length={4} onChange={setOtp} clearSignal={otpClearSignal} />
        </div>

        {infoMessage && (
          <p className="text-sm text-red-500 text-center mt-4">{infoMessage}</p>
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
        <button
          type="button"
          onClick={handleResend}
          className={`cursor-pointer ${
            resending ? "text-gray-400" : "text-blue-600"
          }`}
        >
          {t.resendOtp || "Resend OTP"}
        </button>
      </div>
    </AuthCard>
  )
}
