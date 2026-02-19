"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

// i18n
import eng from "@/constants/i18/eng/register.json"
import guj from "@/constants/i18/guj/register.json"
import hindi from "@/constants/i18/hindi/register.json"

// UI
import AuthCard1 from "@/components/ui/AuthCard1"
import AuthHeader from "@/components/ui/AuthHeader"
import Button from "@/components/ui/Button"
import DatePicker from "@/components/ui/DatePcker"
import AutoComplete from "@/components/ui/AutoComplete"
import SeanebIdField from "@/components/ui/SeanebId"
import OtpVerificationModal from "@/components/ui/OtpVerificationModal"

// Services
import { signupUser } from "@/app/auth/auth-service/signup.service"
import { sendEmailOtp, verifyEmailOtp } from "@/app/auth/auth-service/email.service"
import { getDefaultProductKey, setDefaultProductKey } from "@/services/pro.service"
import { authStore } from "@/app/auth/auth-service/store/authStore"
import {
  getCookie,
  getJsonCookie,
  setCookie,
  setJsonCookie,
  removeCookie,
} from "@/services/cookie"

const LANG_MAP = { eng, guj, hindi }
const LANGUAGE_STORAGE_KEY = "auth_language"

const emailRegex =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  gender: "",
  dob: "",
  hometown: "",
  placeId: "",
  seanebId: "",
  agree: false,
}

const isAge13Plus = (dob) => {
  if (!dob) return false

  const birth = new Date(dob)
  const today = new Date()

  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return age >= 13
}

export default function CompleteProfilePage() {
  const router = useRouter()
  const lockedProductKey = getDefaultProductKey()

  const [language, setLanguage] = useState(() => {
    if (typeof window !== "undefined") {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      if (savedLanguage && LANG_MAP[savedLanguage]) {
        return savedLanguage
      }
    }
    return "eng"
  })
  const t = LANG_MAP[language]

  const [form, setForm] = useState(EMPTY_FORM)
  const [mounted, setMounted] = useState(false)

  const [emailVerified, setEmailVerified] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [emailOtpOpen, setEmailOtpOpen] = useState(false)
  const [emailOtp, setEmailOtp] = useState("")
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false)
  const [emailOtpResending, setEmailOtpResending] = useState(false)
  const [emailOtpError, setEmailOtpError] = useState("")
  const [emailOtpClearSignal, setEmailOtpClearSignal] = useState(0)

  const [mobileVerified, setMobileVerified] = useState(false)
  const [seanebVerified, setSeanebVerified] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const setField = (key, value) => {
    let safeValue = value

    if (typeof value === "boolean") {
      safeValue = value
    } else if (value?.target) {
      safeValue =
        value.target.type === "checkbox"
          ? value.target.checked
          : value.target.value
    }

    if (key === "email") {
      setEmailVerified(false)
      removeCookie("verified_email")
    }

    if (key === "seanebId") {
      setSeanebVerified(false)
    }

    if (key === "hometown") {
      setForm((prev) => ({ ...prev, placeId: "" }))
    }

    setForm((prev) => ({ ...prev, [key]: safeValue }))
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    if (LANG_MAP[language]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    }
  }, [language])

  /* ================= MOBILE OTP GUARD ================= */

  useEffect(() => {
    let verified = getCookie("mobile_verified")
    let mobile = getCookie("otp_mobile")
    let cc = getCookie("otp_cc")

    if (verified !== "true" || !mobile || !cc) {
      router.replace("/auth/login")
      return
    }

    setMobileVerified(true)
    setMounted(true)

    const saved = getJsonCookie("reg_form_draft")
    if (saved) setForm(saved)

    const until = getCookie("email_otp_until")
    if (until) {
      const diff = Math.floor((+until - Date.now()) / 1000)
      if (diff > 0) setEmailCooldown(diff)
    }
  }, [router])

  /* ================= SAVE DRAFT ================= */

  useEffect(() => {
    if (!mounted) return
    setJsonCookie("reg_form_draft", form, { path: "/" })
  }, [form, mounted])

  /* ================= EMAIL VERIFIED ================= */

  useEffect(() => {
    if (!mounted) return
    const verifiedEmail = getCookie("verified_email")
    if (verifiedEmail === form.email) {
      setEmailVerified(true)
    }
  }, [form.email, mounted])

  /* ================= EMAIL COOLDOWN ================= */

  useEffect(() => {
    if (emailCooldown <= 0) return

    const timer = setInterval(() => {
      setEmailCooldown((c) => {
        if (c <= 1) {
          removeCookie("email_otp_until")
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [emailCooldown])

  /* ================= EMAIL OTP ================= */

  const handleEmailVerify = async () => {
    const email = form.email.trim()

    if (
      emailVerified ||
      emailLoading ||
      !emailRegex.test(email)
    )
      return

    if (emailCooldown > 0) {
      setEmailOtpOpen(true)
      setEmailOtpError("")
      return
    }

    try {
      setEmailLoading(true)
      setEmailOtpError("")

      await sendEmailOtp({ email, purpose: 1 })

      const until = Date.now() + 60 * 1000
      setCookie("email_otp_until", String(until), {
        maxAge: 60,
        path: "/",
      })

      setJsonCookie(
        "otp_context",
        { type: "email", email, purpose: 1 },
        { maxAge: 60, path: "/" }
      )

      setEmailCooldown(60)
      setEmailOtp("")
      setEmailOtpClearSignal((value) => value + 1)
      setEmailOtpOpen(true)
    } finally {
      setEmailLoading(false)
    }
  }

  const handleVerifyEmailOtpInline = async () => {
    const email = form.email.trim()
    if (!email || String(emailOtp).length !== 4 || emailOtpVerifying) return

    try {
      setEmailOtpVerifying(true)
      setEmailOtpError("")
      await verifyEmailOtp({ email, otp: emailOtp, purpose: 1 })
      setCookie("verified_email", email, { maxAge: 60 * 60 * 24 * 7, path: "/" })
      removeCookie("email_otp_until")
      removeCookie("otp_context")
      setEmailVerified(true)
      setEmailOtpOpen(false)
      setEmailOtp("")
    } catch (err) {
      setEmailOtpError(
        err?.response?.data?.message ||
          err?.message ||
          "Invalid OTP"
      )
      setEmailOtp("")
      setEmailOtpClearSignal((value) => value + 1)
    } finally {
      setEmailOtpVerifying(false)
    }
  }

  const handleResendEmailOtpInline = async () => {
    const email = form.email.trim()
    if (!email || emailOtpResending || emailCooldown > 0) return

    try {
      setEmailOtpResending(true)
      setEmailOtpError("")
      await sendEmailOtp({ email, purpose: 1 })
      const until = Date.now() + 60 * 1000
      setCookie("email_otp_until", String(until), { maxAge: 60, path: "/" })
      setEmailCooldown(60)
    } catch (err) {
      setEmailOtpError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to resend OTP"
      )
    } finally {
      setEmailOtpResending(false)
    }
  }

  /* ================= SUBMIT ================= */

  const handleSubmit = async () => {
    if (!isAge13Plus(form.dob)) {
      alert("User must be at least 13 years old")
      return
    }

    const verifiedMobile = getJsonCookie("verified_mobile")
    const cc = getCookie("otp_cc") || verifiedMobile?.country_code
    const mobile = getCookie("otp_mobile") || verifiedMobile?.mobile_number

    if (!cc || !mobile) {
      router.replace("/auth/login")
      return
    }

    setSubmitting(true)
    setSubmitError("")

    try {
      const response = await signupUser({
        country_code: cc,
        mobile_number: mobile,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        dob: form.dob,
        place_id: form.placeId,
        gender: form.gender,
        seaneb_id: form.seanebId,
        product_key: lockedProductKey,
      })
      setDefaultProductKey(lockedProductKey)

      // ✅ FIX: Capture tokens from signup response
      const data = response?.data || response || {}
      
      // Store tokens if returned in response body
      if (data.access_token) {
        authStore.setAccessToken(data.access_token)
        console.log("[complete-profile] Access token captured from signup response")
      }
      
      if (data.refresh_token) {
        authStore.setRefreshToken(data.refresh_token)
        console.log("[complete-profile] Refresh token captured from signup response")
      }
      
      if (data.csrf_token) {
        authStore.setCsrfToken(data.csrf_token)
        console.log("[complete-profile] CSRF token captured from signup response")
      }

      // Set session start time for 6-hour session
      authStore.setSessionStartTime()

      // Mark profile as completed
      setCookie("profile_completed", "true", {
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      })

      // Clean up registration cookies
      removeCookie("reg_form_draft")
      removeCookie("otp_context")
      removeCookie("otp_cc")
      removeCookie("otp_mobile")
      removeCookie("mobile_verified")
      removeCookie("verified_email")
      removeCookie("email_otp_until")

      // Redirect to business option page (user can register business or skip to dashboard)
      router.replace("/auth/business-option")
    } catch (err) {
      const status = err?.response?.status
      const message = err?.response?.data?.message || err?.message || "Signup failed"

      console.error("[complete-profile] Signup error:", { status, message })

      // Handle user already exists (409)
      if (status === 409) {
        console.log("[complete-profile] User already exists (409) - redirecting to business option")
        // User already exists, still show business option
        setCookie("profile_completed", "true", {
          maxAge: 60 * 60 * 24 * 7,
          path: "/",
        })
        removeCookie("reg_form_draft")
        removeCookie("otp_context")
        removeCookie("otp_cc")
        removeCookie("otp_mobile")
        router.replace("/auth/business-option")
        return
      }

      // Handle session expired (401)
      if (status === 401) {
        setSubmitError("Session expired. Please login again.")
        setTimeout(() => {
          router.replace("/auth/login")
        }, 2000)
        return
      }

      // Other errors
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  return (
    <AuthCard1 header={<AuthHeader language={language} setLanguage={setLanguage} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4 sm:p-5">
          <h1 className="text-2xl font-semibold text-gray-900">{t.completeProfileTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.completeProfileSubtitle}</p>
        </div>

        {/* Error Message */}
        {submitError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        {/* Main Form */}
        <div className="grid grid-cols-1 gap-4 mt-6 md:grid-cols-2">
          <Input label={t.firstName} value={form.firstName} onChange={(v) => setField("firstName", v)} />
          <Input label={t.lastName} value={form.lastName} onChange={(v) => setField("lastName", v)} />

          <EmailField
            value={form.email}
            verified={emailVerified}
            loading={emailLoading}
            cooldown={emailCooldown}
            onChange={(v) => setField("email", v)}
            onVerify={handleEmailVerify}
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-800">{t.gender} *</label>
            <select
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={form.gender}
              onChange={(e) => setField("gender", e)}
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-800">{t.dob} *</label>
            <DatePicker value={form.dob} onChange={(v) => setField("dob", v)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-800">{t.hometown} *</label>
            <AutoComplete
              value={form.hometown}
              onChange={(v) => setField("hometown", v)}
              onSelect={(city) => setField("placeId", city?.place_id || "")}
            />
          </div>

          <SeanebIdField
            value={form.seanebId}
            onChange={(v) => setField("seanebId", v)}
            verified={seanebVerified}
            setVerified={setSeanebVerified}
          />
        </div>

        {/* Checkbox */}
        <div className="checkbox-row">
          <input
            type="checkbox"
            id="agree-checkbox"
            checked={form.agree}
            onChange={(e) => setField("agree", e.target.checked)}
          />
          <label htmlFor="agree-checkbox" className="text-sm cursor-pointer">{t.agreeText}</label>
        </div>

        {/* Submit Button */}
        <Button
          label={submitting ? "Creating account..." : t.submit}
          disabled={
            !mobileVerified ||
            !seanebVerified ||
            !form.placeId ||
            !form.gender ||
            !form.agree ||
            submitting
          }
          onClick={handleSubmit}
        />
      </div>

      <OtpVerificationModal
        open={emailOtpOpen}
        title="Verify Email OTP"
        subtitle="Enter the 4-digit OTP sent to"
        targetLabel={form.email.trim()}
        otp={emailOtp}
        onOtpChange={setEmailOtp}
        onClose={() => {
          setEmailOtpOpen(false)
          setEmailOtpError("")
          setEmailOtp("")
        }}
        onVerify={handleVerifyEmailOtpInline}
        onResend={handleResendEmailOtpInline}
        loading={emailOtpVerifying}
        resending={emailOtpResending}
        cooldown={emailCooldown}
        error={emailOtpError}
        clearSignal={emailOtpClearSignal}
      />
    </AuthCard1>
  )
}

function Input({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-800">{label} *</label>
      <input
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  )
}

function EmailField({ value, onChange, onVerify, verified, loading, cooldown }) {
  const buttonLabel = verified ? "Verified" : cooldown > 0 ? "Enter OTP" : "Verify"
  const hasEmail = value.trim().length > 0

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-800">Email (Optional)</label>
      <div className="flex items-center gap-2">
        <input
          type="email"
          className={`h-11 flex-1 rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition-all ${
            verified
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          }`}
          value={value}
          disabled={verified}
          onChange={(e) => onChange(e.target.value)}
          placeholder="your.email@example.com"
        />
        <button
          type="button"
          onClick={onVerify}
          disabled={!hasEmail || verified || loading || !emailRegex.test(value.trim())}
          className="h-11 min-w-[110px] rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {loading ? "Sending..." : buttonLabel}
        </button>
      </div>
      <p className={`text-xs ${verified ? "text-emerald-600" : "text-slate-500"}`}>
        {verified ? "Email verified successfully." : "You can continue without email verification."}
      </p>
    </div>
  )
}
