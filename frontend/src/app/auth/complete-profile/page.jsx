"use client"

import { useCallback, useEffect, useState } from "react"
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
import TermsConditionsModal from "@/components/ui/TermsConditionsModal"
import AuthTransitionOverlay from "@/components/ui/AuthTransitionOverlay"

// Services
import { signupUser } from "@/app/auth/auth-service/signup.service"
import { ensureSessionReady } from "@/app/auth/auth-service/auth.bootstrap"
import { sendEmailOtp, verifyEmailOtp } from "@/app/auth/auth-service/email.service"
import { authApi } from "@/lib/api/client"
import { API } from "@/lib/config/apiPaths"
import { getDefaultProductKey, setDefaultProductKey } from "@/services/dashboard.service"
import { authStore } from "@/app/auth/auth-service/store/authStore"
import { getAuthAppUrl } from "@/lib/core/appUrls"
import { redirectToListingWithBridgeToken } from "@/lib/postLoginRedirect"
import useAuthSubmitTransition from "@/hooks/useAuthSubmitTransition"
import { notifyAuthChanged } from "@/services/auth.service"
import {
  clearAuthFlowContext,
  getAuthFlowContext,
  ingestAuthFlowContextFromUrl,
  stripAuthFlowParamsFromAddressBar,
} from "@/lib/auth/flowContext"
import {
  getCookie,
  getJsonCookie,
  setCookie,
  setJsonCookie,
  removeCookie,
} from "@/services/auth.service"

const LANG_MAP = { eng, guj, hindi }
const LANGUAGE_STORAGE_KEY = "auth_language"
const RETURN_TO_COOKIE = "auth_return_to"
const OTP_PURPOSE_SIGNUP_OR_LOGIN = 0
const TERMS_TEXT_PATH = "/legal/terms-conditions-property.txt"
const LISTING_APP_ORIGIN = (() => {
  try {
    return new URL(String(process.env.NEXT_PUBLIC_APP_URL || "").trim()).origin
  } catch {
    return ""
  }
})()
const hasCsrfCookie = () =>
  Boolean(
    String(getCookie("csrf_token_property") || "").trim()
  )

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

const resolveVerifiedMobile = () => {
  const verifiedMobile = getJsonCookie("verified_mobile")
  const ccFromJson = String(verifiedMobile?.country_code || "").trim()
  const mobileFromJson = String(verifiedMobile?.mobile_number || "").trim()
  if (ccFromJson && mobileFromJson) {
    return { country_code: ccFromJson, mobile_number: mobileFromJson }
  }

  const signupProof = getJsonCookie("signup_otp_verified")
  const ccFromProof = String(signupProof?.country_code || "").trim()
  const mobileFromProof = String(signupProof?.mobile_number || "").trim()
  if (ccFromProof && mobileFromProof) {
    return { country_code: ccFromProof, mobile_number: mobileFromProof }
  }

  const verifiedFlag = String(getCookie("mobile_verified") || "").trim().toLowerCase()
  const ccFromCookie = String(getCookie("otp_cc") || "").trim()
  const mobileFromCookie = String(getCookie("otp_mobile") || "").trim()
  if ((verifiedFlag === "true" || verifiedFlag === "1" || verifiedFlag === "yes") && ccFromCookie && mobileFromCookie) {
    return { country_code: ccFromCookie, mobile_number: mobileFromCookie }
  }

  return null
}

const isSafeReturnTo = (value) => {
  const target = String(value || "").trim()
  if (!target) return false
  if (target.startsWith("/")) return true

  try {
    const parsed = new URL(target)
    if (!/^https?:$/i.test(parsed.protocol)) return false
    if (LISTING_APP_ORIGIN) return parsed.origin === LISTING_APP_ORIGIN
    if (typeof window === "undefined") return true
    return parsed.hostname === window.location.hostname
  } catch {
    return false
  }
}

const getPostLoginTarget = () => {
  const flowTarget = String(getAuthFlowContext()?.returnTo || "").trim()
  if (isSafeReturnTo(flowTarget)) return flowTarget

  const cookieTarget = String(getCookie(RETURN_TO_COOKIE) || "").trim()
  if (isSafeReturnTo(cookieTarget)) return cookieTarget

  return ""
}

const resolveRedirectTarget = (target) => {
  const safeTarget = String(target || "").trim()
  if (!safeTarget) return "/dashboard"
  if (/^https?:\/\//i.test(safeTarget)) return safeTarget
  if (safeTarget.startsWith("/")) return safeTarget
  return "/dashboard"
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
  const t = LANG_MAP[language] || eng

  const [form, setForm] = useState(EMPTY_FORM)
  const [mounted, setMounted] = useState(false)
  const [accessAllowed, setAccessAllowed] = useState(false)

  const [emailVerified, setEmailVerified] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailOtpOpen, setEmailOtpOpen] = useState(false)
  const [emailOtp, setEmailOtp] = useState("")
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false)
  const [emailOtpResending, setEmailOtpResending] = useState(false)
  const [emailOtpError, setEmailOtpError] = useState("")
  const [emailOtpClearSignal, setEmailOtpClearSignal] = useState(0)
  const [termsModalOpen, setTermsModalOpen] = useState(false)

  const [mobileVerifiedData, setMobileVerifiedData] = useState({ country_code: "", mobile_number: "" })
  const [verifiedMobileLabel, setVerifiedMobileLabel] = useState("")
  const [hasFreshSignupOtpProof, setHasFreshSignupOtpProof] = useState(false)

  const [seanebVerified, setSeanebVerified] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const { isTransitioning, showTransition, runWithTransition } = useAuthSubmitTransition()

  const redirectToPostLoginTarget = useCallback(async ({ sourcePayload = null } = {}) => {
    const target = resolveRedirectTarget(getPostLoginTarget())
    if (target === "/dashboard" || target.startsWith("/dashboard/")) {
      removeCookie(RETURN_TO_COOKIE)
      clearAuthFlowContext()
      router.replace(target)
      return true
    }
    try {
      const redirected = await redirectToListingWithBridgeToken({
        returnTo: target,
        sourcePayload,
      })
      if (!redirected) {
        throw new Error("Unable to redirect. Please try again.")
      }
      removeCookie(RETURN_TO_COOKIE)
      clearAuthFlowContext()
      return true
    } catch (err) {
      setSubmitError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to continue. Please try again."
      )
      return false
    }
  }, [router])

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

  useEffect(() => {
    ingestAuthFlowContextFromUrl()
    stripAuthFlowParamsFromAddressBar()
  }, [])

  useEffect(() => {
    const hasCsrf = hasCsrfCookie()
    const profileCompleted = String(getCookie("profile_completed") || "").trim().toLowerCase()
    const isProfileDone = profileCompleted === "1" || profileCompleted === "true" || profileCompleted === "yes"

    if (hasCsrf && isProfileDone) {
      void redirectToPostLoginTarget()
    }
  }, [redirectToPostLoginTarget])

  useEffect(() => {
    const resolvedMobile = resolveVerifiedMobile()
    const hasCsrf = hasCsrfCookie()

    if (!resolvedMobile) {
      setMounted(false)
      router.replace(hasCsrf ? "/dashboard" : getAuthAppUrl("/auth/login"))
      return
    }

    const cc = String(resolvedMobile.country_code).trim()
    const mobile = String(resolvedMobile.mobile_number).trim()
    const signupOtpProof = getJsonCookie("signup_otp_verified")
    const proofCc = String(signupOtpProof?.country_code || "").trim()
    const proofMobile = String(signupOtpProof?.mobile_number || "").trim()
    const proofPurpose = Number(signupOtpProof?.purpose ?? -1)
    const hasAcceptedProofPurpose =
      proofPurpose === OTP_PURPOSE_SIGNUP_OR_LOGIN || proofPurpose === 1
    let hasValidProof =
      proofCc === cc &&
      proofMobile === mobile &&
      hasAcceptedProofPurpose

    if (!hasValidProof) {
      const postOtpVerified = String(getCookie("post_otp_verified") || "").trim().toLowerCase()
      const hasPostOtpMarker =
        postOtpVerified === "1" || postOtpVerified === "true" || postOtpVerified === "yes"
      if (hasPostOtpMarker) {
        setJsonCookie(
          "signup_otp_verified",
          {
            country_code: cc,
            mobile_number: mobile,
            purpose: OTP_PURPOSE_SIGNUP_OR_LOGIN,
            verified_at: Date.now(),
          },
          { maxAge: 60 * 60 * 24 * 7, path: "/" }
        )
        hasValidProof = true
      }
    }

    if (!hasValidProof) {
      const mobileVerifiedMarker = String(getCookie("mobile_verified") || "").trim().toLowerCase()
      const hasMobileVerifiedMarker =
        mobileVerifiedMarker === "1" || mobileVerifiedMarker === "true" || mobileVerifiedMarker === "yes"
      if (hasMobileVerifiedMarker && cc && mobile) {
        setJsonCookie(
          "signup_otp_verified",
          {
            country_code: cc,
            mobile_number: mobile,
            purpose: OTP_PURPOSE_SIGNUP_OR_LOGIN,
            verified_at: Date.now(),
          },
          { maxAge: 60 * 60 * 24 * 7, path: "/" }
        )
        hasValidProof = true
      }
    }

    if (!hasValidProof) {
      setMounted(false)
      router.replace(hasCsrf ? "/dashboard" : getAuthAppUrl("/auth/login"))
      return
    }

    setMobileVerifiedData({ country_code: cc, mobile_number: mobile })
    setVerifiedMobileLabel(`+${cc} ${mobile}`)
    setSubmitError("")
    setHasFreshSignupOtpProof(true)
    setAccessAllowed(true)

    const saved = getJsonCookie("reg_form_draft")
    if (saved) setForm(saved)

    setMounted(true)
  }, [router])

  useEffect(() => {
    if (!mounted) return
    setJsonCookie("reg_form_draft", form, { path: "/" })
  }, [form, mounted])

  useEffect(() => {
    if (!mounted) return
    const verifiedEmail = getCookie("verified_email")
    if (verifiedEmail === form.email) {
      setEmailVerified(true)
    }
  }, [form.email, mounted])

  const handleEmailVerify = async () => {
    const email = form.email.trim()

    if (
      emailVerified ||
      emailLoading ||
      !emailRegex.test(email)
    )
      return

    try {
      setEmailLoading(true)
      setEmailOtpError("")

      await sendEmailOtp({ email, purpose: 1 })

      setJsonCookie(
        "otp_context",
        { type: "email", email, purpose: 1 },
        { maxAge: 60, path: "/" }
      )

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
    if (!email || emailOtpResending) return

    try {
      setEmailOtpResending(true)
      setEmailOtpError("")
      await sendEmailOtp({ email, purpose: 1 })
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

  const finalizeAuthenticatedSession = async () => {
    try {
      await authApi.get(API.PROFILE, {
        skipAuthRedirect: true,
      })
    } catch {
      // Refresh success is enough for session finalization; profile check is best effort.
    }

    notifyAuthChanged({ force: true })
  }

  const handleSubmit = async () => {
    const firstName = String(form.firstName || "").trim()
    const lastName = String(form.lastName || "").trim()
    const seanebId = String(form.seanebId || "").trim()

    if (!firstName || !lastName) {
      setSubmitError("First name and last name are required.")
      return
    }
    if (!seanebId) {
      setSubmitError("Seaneb ID is required.")
      return
    }
    if (!isAge13Plus(form.dob)) {
      alert("User must be at least 13 years old")
      return
    }

    const cc = String(mobileVerifiedData?.country_code || "").trim()
    const mobile = String(mobileVerifiedData?.mobile_number || "").trim()

    if (!cc || !mobile) {
      setSubmitError("Verified mobile is missing. Please login again.")
      router.replace(getAuthAppUrl("/auth/login"))
      return
    }
    if (!hasFreshSignupOtpProof) {
      setSubmitError("OTP verification expired. Please login and verify OTP again.")
      router.replace(getAuthAppUrl("/auth/login"))
      return
    }

    setSubmitError("")

    await runWithTransition(
      async () => {
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
        return response
      },
      {
        onSuccess: async (response) => {
          setDefaultProductKey(lockedProductKey)

          // Cookie-only auth: backend owns token/csrf cookie issuance.
          authStore.setSessionStartTime()

          setCookie("profile_completed", "true", {
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
          })
          setCookie("post_otp_verified", "1", {
            maxAge: 180,
            path: "/",
          })

          await finalizeAuthenticatedSession()

          const sessionReady = await ensureSessionReady({ force: true })
          if (!sessionReady) {
            removeCookie("reg_form_draft")
            removeCookie("otp_context")
            removeCookie("otp_cc")
            removeCookie("otp_mobile")
            removeCookie("mobile_verified")
            removeCookie("signup_otp_verified")
            removeCookie("verified_email")
            router.replace(getAuthAppUrl("/auth/login"))
            return
          }

          removeCookie("reg_form_draft")
          removeCookie("otp_context")
          removeCookie("otp_cc")
          removeCookie("otp_mobile")
          removeCookie("mobile_verified")
          removeCookie("signup_otp_verified")
          removeCookie("verified_email")

          await redirectToPostLoginTarget({ sourcePayload: response?.data || response })
        },
        onError: (err) => {
          const status = err?.response?.status
          const message =
            err?.response?.data?.error?.message ||
            err?.response?.data?.message ||
            err?.message ||
            "Signup failed"

          if (status === 409) {
            setCookie("profile_completed", "true", {
              maxAge: 60 * 60 * 24 * 7,
              path: "/",
            })
            setCookie("post_otp_verified", "1", {
              maxAge: 180,
              path: "/",
            })
            notifyAuthChanged({ force: true })
            removeCookie("reg_form_draft")
            removeCookie("otp_context")
            removeCookie("otp_cc")
            removeCookie("otp_mobile")
            void redirectToPostLoginTarget({ sourcePayload: err?.response?.data || null })
            return
          }

          if (status === 401) {
            setSubmitError("Session expired. Please login again.")
            return
          }

          setSubmitError(message)
        },
      }
    )
  }

  if (!mounted || !accessAllowed) return null
  if (showTransition) {
    return (
      <AuthTransitionOverlay
        title="Creating account..."
        description="Saving your profile and preparing your dashboard."
      />
    )
  }

  return (
    <AuthCard1 header={<AuthHeader language={language} setLanguage={setLanguage} />}>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4 sm:p-5">
          <h1 className="text-2xl font-semibold text-gray-900">{t.completeProfileTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.completeProfileSubtitle}</p>
          <p className="text-sm text-slate-700 mt-2">Verified mobile: <span className="font-semibold">{verifiedMobileLabel}</span></p>
        </div>

        {submitError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 mt-6 md:grid-cols-2">
          <Input label={t.firstName} value={form.firstName} onChange={(v) => setField("firstName", v)} />
          <Input label={t.lastName} value={form.lastName} onChange={(v) => setField("lastName", v)} />

          <EmailField
            value={form.email}
            verified={emailVerified}
            loading={emailLoading}
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

        <div className="checkbox-row">
          <input
            type="checkbox"
            id="agree-checkbox"
            checked={form.agree}
            onChange={(e) => setField("agree", e.target.checked)}
          />
          <label htmlFor="agree-checkbox" className="text-sm cursor-pointer">
            {t.agreeText}{" "}
            <button
              type="button"
              onClick={() => setTermsModalOpen(true)}
              className="text-blue-600 underline"
            >
              Terms & Conditions
            </button>
          </label>
        </div>

        <Button
          type="submit"
          label={isTransitioning ? "Creating account..." : t.submit}
          disabled={
            !String(form.firstName || "").trim() ||
            !String(form.lastName || "").trim() ||
            !String(form.seanebId || "").trim() ||
            !String(form.dob || "").trim() ||
            !seanebVerified ||
            !form.placeId ||
            !form.gender ||
            !form.agree ||
            isTransitioning
          }
        />
      </form>

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
        cooldown={0}
        error={emailOtpError}
        clearSignal={emailOtpClearSignal}
      />
      <TermsConditionsModal
        open={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        textPath={TERMS_TEXT_PATH}
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

function EmailField({ value, onChange, onVerify, verified, loading }) {
  const buttonLabel = verified ? "Verified" : "Verify"
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
