"use client"

import { useState, useEffect } from "react"

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
import { sendOtp, verifyOtp } from "@/app/auth/auth-service/otp.service"
import api from "@/lib/api/client"
import { getDefaultProductKey, setDefaultProductKey } from "@/services/product.service"
import { authStore } from "@/app/auth/auth-service/store/authStore"
import { refreshAccessToken } from "@/app/auth/auth-service/authservice"
import { getListingAppUrl } from "@/lib/appUrls"
import { redirectToOpenerOrSelf } from "@/lib/postLoginRedirect"
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
const mobileRegex = /^[0-9]{8,15}$/
const MOBILE_OTP_UNTIL_COOKIE = "complete_mobile_otp_until"
const OTP_VIA_WHATSAPP = "whatsapp"
const OTP_VIA_SMS = "sms"
const RETURN_TO_COOKIE = "auth_return_to"

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

const resolveVerifiedMobile = () => {
  const verifiedMobile = getJsonCookie("verified_mobile")
  const ccFromJson = String(verifiedMobile?.country_code || "").trim()
  const mobileFromJson = String(verifiedMobile?.mobile_number || "").trim()
  if (ccFromJson && mobileFromJson) {
    return { country_code: ccFromJson, mobile_number: mobileFromJson }
  }

  const verifiedFlag = String(getCookie("mobile_verified") || "").trim().toLowerCase()
  const ccFromCookie = String(getCookie("otp_cc") || "").trim()
  const mobileFromCookie = String(getCookie("otp_mobile") || "").trim()
  if ((verifiedFlag === "true" || verifiedFlag === "1" || verifiedFlag === "yes") && ccFromCookie && mobileFromCookie) {
    return { country_code: ccFromCookie, mobile_number: mobileFromCookie }
  }

  const otpCtx = getJsonCookie("otp_context")
  const ccFromCtx = String(otpCtx?.country_code || "").trim()
  const mobileFromCtx = String(otpCtx?.mobile_number || "").trim()
  if (ccFromCtx && mobileFromCtx) {
    return { country_code: ccFromCtx, mobile_number: mobileFromCtx }
  }

  return null
}

const getErrorMessage = (err, fallback) =>
  err?.response?.data?.error?.message ||
  err?.response?.data?.message ||
  err?.message ||
  fallback

const isSafeReturnTo = (value) => {
  const target = String(value || "").trim()
  if (!target) return false
  if (target.startsWith("/")) return true

  try {
    const parsed = new URL(target)
    if (!/^https?:$/i.test(parsed.protocol)) return false
    if (typeof window === "undefined") return true
    return parsed.hostname === window.location.hostname
  } catch {
    return false
  }
}

const getPostLoginTarget = () => {
  if (typeof window === "undefined") return ""

  const queryTarget = String(new URLSearchParams(window.location.search).get("returnTo") || "").trim()
  if (isSafeReturnTo(queryTarget)) return queryTarget

  const cookieTarget = String(getCookie(RETURN_TO_COOKIE) || "").trim()
  if (isSafeReturnTo(cookieTarget)) return cookieTarget

  return ""
}

const resolveRedirectTarget = (target) => {
  const safeTarget = String(target || "").trim()
  if (!safeTarget) return getListingAppUrl("/home")
  if (/^https?:\/\//i.test(safeTarget)) return safeTarget
  if (safeTarget.startsWith("/")) return getListingAppUrl(safeTarget)
  return getListingAppUrl("/home")
}

export default function CompleteProfilePage() {
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
  const [verifiedMobileLabel, setVerifiedMobileLabel] = useState("")
  const [mobileDraft, setMobileDraft] = useState("")
  const [mobileVerifiedData, setMobileVerifiedData] = useState({ country_code: "", mobile_number: "" })
  const [mobileLoading, setMobileLoading] = useState(false)
  const [mobileCooldown, setMobileCooldown] = useState(0)
  const [mobileOtpOpen, setMobileOtpOpen] = useState(false)
  const [mobileOtp, setMobileOtp] = useState("")
  const [mobileOtpVerifying, setMobileOtpVerifying] = useState(false)
  const [mobileOtpResending, setMobileOtpResending] = useState(false)
  const [mobileOtpError, setMobileOtpError] = useState("")
  const [mobileOtpClearSignal, setMobileOtpClearSignal] = useState(0)
  const [mobileOtpVia, setMobileOtpVia] = useState(OTP_VIA_WHATSAPP)
  const [seanebVerified, setSeanebVerified] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const redirectToPostLoginTarget = () => {
    const target = resolveRedirectTarget(getPostLoginTarget())
    removeCookie(RETURN_TO_COOKIE)
    redirectToOpenerOrSelf(target)
  }

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

  const parseMobileParts = (value) => {
    const raw = String(value || "").trim()
    if (!raw) return { countryCode: "", mobileNumber: "" }

    const plusMatch = raw.match(/^\+(\d{1,4})\s*([0-9]{8,15})$/)
    if (plusMatch) {
      return { countryCode: plusMatch[1], mobileNumber: plusMatch[2] }
    }

    const compact = raw.replace(/[^\d]/g, "")
    if (compact.length < 8) return { countryCode: "", mobileNumber: "" }

    const fallbackCountryCode = String(getCookie("otp_cc") || "").trim()
    return {
      countryCode: fallbackCountryCode,
      mobileNumber: compact,
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    if (LANG_MAP[language]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    }
  }, [language])

  /* ================= MOBILE OTP GUARD ================= */

  useEffect(() => {
    let active = true

    const redirectIfSessionAlreadyValid = async () => {
      const hasCsrf = String(getCookie("csrf_token_property") || "").trim().length > 0
      if (!hasCsrf) return

      try {
        if (!authStore.getAccessToken()) {
          await refreshAccessToken()
        }
        const res = await api.get("/profile/me", {
          withCredentials: true,
          skipRefresh: true,
          skipAuthRedirect: true,
        })
        if (!active) return
        if (Number(res?.status || 0) === 200 && getCookie("profile_completed") === "true") {
          redirectToPostLoginTarget()
        }
      } catch {
        // Continue normal onboarding flow when session isn't fully ready.
      }
    }

    void redirectIfSessionAlreadyValid()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const resolvedMobile = resolveVerifiedMobile()

    if (resolvedMobile) {
      const cc = String(resolvedMobile.country_code).trim()
      const mobile = String(resolvedMobile.mobile_number).trim()
      setMobileDraft(`+${cc} ${mobile}`)
      setMobileVerified(false)
      setMobileVerifiedData({ country_code: "", mobile_number: "" })
      setVerifiedMobileLabel("")
      setSubmitError("")
    } else {
      setMobileVerified(false)
      setMobileVerifiedData({ country_code: "", mobile_number: "" })
      setVerifiedMobileLabel("")
      const ccFromCookie = String(getCookie("otp_cc") || "").trim()
      const mobileFromCookie = String(getCookie("otp_mobile") || "").trim()
      setMobileDraft(ccFromCookie && mobileFromCookie ? `+${ccFromCookie} ${mobileFromCookie}` : "")
    }

    setMounted(true)

    const saved = getJsonCookie("reg_form_draft")
    if (saved) setForm(saved)

    const until = getCookie("email_otp_until")
    if (until) {
      const diff = Math.floor((+until - Date.now()) / 1000)
      if (diff > 0) setEmailCooldown(diff)
    }

    const mobileUntil = Number(getCookie(MOBILE_OTP_UNTIL_COOKIE) || 0)
    if (mobileUntil > Date.now()) {
      setMobileCooldown(Math.floor((mobileUntil - Date.now()) / 1000))
    }
  }, [])

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

  useEffect(() => {
    if (mobileCooldown <= 0) return

    const timer = setInterval(() => {
      setMobileCooldown((value) => {
        if (value <= 1) {
          removeCookie(MOBILE_OTP_UNTIL_COOKIE)
          return 0
        }
        return value - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [mobileCooldown])

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

  const handleMobileVerify = async () => {
    if (mobileVerified || mobileLoading) return

    const { countryCode, mobileNumber } = parseMobileParts(mobileDraft)
    if (!mobileRegex.test(mobileNumber)) {
      setSubmitError("Enter a valid mobile number to verify")
      return
    }
    if (!countryCode) {
      setSubmitError("Country code missing. Enter mobile as +91 9876543210")
      return
    }

    if (mobileCooldown > 0) {
      setMobileOtpOpen(true)
      setMobileOtpError("")
      return
    }

    try {
      setMobileLoading(true)
      setSubmitError("")
      setMobileOtpError("")
      setMobileVerified(false)
      setMobileVerifiedData({ country_code: "", mobile_number: "" })

      setJsonCookie(
        "otp_context",
        {
          country_code: countryCode,
          mobile_number: mobileNumber,
          purpose: 0,
          via: mobileOtpVia,
          redirect_to: "/auth/complete-profile",
        },
        { maxAge: 300, path: "/" }
      )

      try {
        await sendOtp({ via: mobileOtpVia })
      } catch (primaryErr) {
        // Fallback to SMS when WhatsApp delivery fails.
        if (mobileOtpVia === OTP_VIA_WHATSAPP) {
          setJsonCookie(
            "otp_context",
            {
              country_code: countryCode,
              mobile_number: mobileNumber,
              purpose: 0,
              via: OTP_VIA_SMS,
              redirect_to: "/auth/complete-profile",
            },
            { maxAge: 300, path: "/" }
          )
          await sendOtp({ via: OTP_VIA_SMS })
          setMobileOtpVia(OTP_VIA_SMS)
        } else {
          throw primaryErr
        }
      }

      const until = Date.now() + 60 * 1000
      setCookie(MOBILE_OTP_UNTIL_COOKIE, String(until), { maxAge: 60, path: "/" })
      setMobileCooldown(60)
      setMobileOtp("")
      setMobileOtpClearSignal((value) => value + 1)
      setMobileOtpOpen(true)
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Failed to send mobile OTP. Please try again."))
    } finally {
      setMobileLoading(false)
    }
  }

  const handleVerifyMobileOtpInline = async () => {
    if (String(mobileOtp || "").length !== 4 || mobileOtpVerifying) return

    try {
      setMobileOtpVerifying(true)
      setMobileOtpError("")
      await verifyOtp({ otp: mobileOtp })

      const ctx = getJsonCookie("otp_context")
      const cc = String(ctx?.country_code || "").trim()
      const mobile = String(ctx?.mobile_number || "").trim()
      if (cc && mobile) {
        setCookie("mobile_verified", "true", { maxAge: 60 * 60 * 24 * 7, path: "/" })
        setCookie("otp_cc", cc, { maxAge: 60 * 60 * 24 * 7, path: "/" })
        setCookie("otp_mobile", mobile, { maxAge: 60 * 60 * 24 * 7, path: "/" })
        setJsonCookie("verified_mobile", { country_code: cc, mobile_number: mobile }, { maxAge: 60 * 60 * 24 * 7, path: "/" })
        setMobileVerified(true)
        setMobileVerifiedData({ country_code: cc, mobile_number: mobile })
        setVerifiedMobileLabel(`+${cc} ${mobile}`)
        setMobileDraft(`+${cc} ${mobile}`)
      }

      removeCookie(MOBILE_OTP_UNTIL_COOKIE)
      removeCookie("otp_context")
      setMobileCooldown(0)
      setMobileOtpOpen(false)
      setMobileOtp("")
      setSubmitError("")
    } catch (err) {
      setMobileOtpError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          "Invalid OTP"
      )
      setMobileOtp("")
      setMobileOtpClearSignal((value) => value + 1)
    } finally {
      setMobileOtpVerifying(false)
    }
  }

  const handleResendMobileOtpInline = async () => {
    if (mobileOtpResending || mobileCooldown > 0) return

    try {
      setMobileOtpResending(true)
      setMobileOtpError("")

      const nextVia =
        String(getJsonCookie("otp_context")?.via || mobileOtpVia || OTP_VIA_WHATSAPP).toLowerCase() === OTP_VIA_SMS
          ? OTP_VIA_SMS
          : OTP_VIA_WHATSAPP

      await sendOtp({ via: nextVia })
      const until = Date.now() + 60 * 1000
      setCookie(MOBILE_OTP_UNTIL_COOKIE, String(until), { maxAge: 60, path: "/" })
      setMobileCooldown(60)
    } catch (err) {
      setMobileOtpError(getErrorMessage(err, "Failed to resend OTP"))
    } finally {
      setMobileOtpResending(false)
    }
  }

  /* ================= SUBMIT ================= */

  const handleSubmit = async () => {
    if (!isAge13Plus(form.dob)) {
      alert("User must be at least 13 years old")
      return
    }

    const cc = String(mobileVerifiedData?.country_code || "").trim()
    const mobile = String(mobileVerifiedData?.mobile_number || "").trim()

    if (!mobileVerified || !cc || !mobile) {
      setSubmitError("Mobile OTP not verified. Please verify mobile first.")
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
      removeCookie(MOBILE_OTP_UNTIL_COOKIE)
      removeCookie("verified_email")
      removeCookie("email_otp_until")

      redirectToPostLoginTarget()
    } catch (err) {
      const status = err?.response?.status
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Signup failed"

      console.error("[complete-profile] Signup error:", { status, message })

      // Handle user already exists (409)
      if (status === 409) {
        console.log("[complete-profile] User already exists (409) - redirecting to home")
        setCookie("profile_completed", "true", {
          maxAge: 60 * 60 * 24 * 7,
          path: "/",
        })
        removeCookie("reg_form_draft")
        removeCookie("otp_context")
        removeCookie("otp_cc")
        removeCookie("otp_mobile")
        redirectToPostLoginTarget()
        return
      }

      // Handle session expired (401)
      if (status === 401) {
        setSubmitError("Session expired. Please login again.")
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
          <div className="space-y-1.5 md:col-span-2">
            <MobileField
              value={mobileVerified ? verifiedMobileLabel : mobileDraft}
              verified={mobileVerified}
              loading={mobileLoading}
              cooldown={mobileCooldown}
              onChange={(next) => {
                setMobileDraft(next)
                setMobileVerified(false)
                setMobileVerifiedData({ country_code: "", mobile_number: "" })
                setVerifiedMobileLabel("")
                removeCookie("mobile_verified")
                removeCookie("verified_mobile")
              }}
              onVerify={() => {
                void handleMobileVerify()
              }}
            />
          </div>

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

      <OtpVerificationModal
        open={mobileOtpOpen}
        title="Verify Mobile OTP"
        subtitle="Enter the 4-digit OTP sent to"
        targetLabel={mobileDraft}
        otp={mobileOtp}
        onOtpChange={setMobileOtp}
        onClose={() => {
          setMobileOtpOpen(false)
          setMobileOtpError("")
          setMobileOtp("")
        }}
        onVerify={handleVerifyMobileOtpInline}
        onResend={handleResendMobileOtpInline}
        loading={mobileOtpVerifying}
        resending={mobileOtpResending}
        cooldown={mobileCooldown}
        error={mobileOtpError}
        clearSignal={mobileOtpClearSignal}
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

function MobileField({ value, onChange, onVerify, verified, loading, cooldown }) {
  const buttonLabel = verified ? "Verified" : cooldown > 0 ? "Enter OTP" : "Verify"
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-800">Mobile Number *</label>
      <div className="flex items-center gap-2">
        <input
          type="tel"
          className={`h-11 flex-1 rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition-all ${
            verified
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          }`}
          value={value}
          disabled={verified}
          onChange={(e) => onChange(e.target.value)}
          placeholder="+91 9876543210"
        />
        <button
          type="button"
          onClick={onVerify}
          disabled={verified || loading}
          className={`h-11 min-w-[130px] rounded-lg border px-4 text-sm font-semibold transition-all ${
            verified
              ? "cursor-not-allowed border-emerald-500 bg-emerald-500 text-white"
              : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {loading ? "Sending..." : buttonLabel}
        </button>
      </div>
      <p className={`text-xs ${verified ? "text-emerald-600" : "text-rose-600"}`}>
        {verified
          ? "Mobile OTP verified."
          : "Mobile is required. Verify mobile OTP before submitting profile."}
      </p>
    </div>
  )
}


