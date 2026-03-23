"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import phoneCodes from "@/constants/phoneCodes.json"
import {
  getCookie,
  getJsonCookie,
  notifyAuthChanged,
  setCookie,
  setJsonCookie,
  removeCookie,
} from "@/services/auth.service"
import {
  registerBusiness,
  getOnboardingChargePreview,
  verifyPanForBranch,
  verifyGstForBranch,
  getBusinessAutocomplete,
} from "@/app/auth/auth-service/business.service"
import { sendEmailOtp, verifyEmailOtp } from "@/app/auth/auth-service/email.service"
import { sendOtp } from "@/app/auth/auth-service/otp.service"
import { verifyOtpAndLogin, waitForAuthCookies } from "@/app/auth/auth-service/authservice"
import { hydrateAuthSession, refreshAccessToken } from "@/lib/api/client"
import { authApi } from "@/lib/auth/apiClient"
import { getAccessToken, getCsrfToken } from "@/lib/auth/tokenStorage"
import { getSessionHint } from "@/lib/auth/sessionHint"
import { clearRefreshBudget } from "@/lib/auth/refreshBudget"
import { API_BASE_URL } from "@/lib/core/apiBaseUrl"
import { acquireRefreshLock, releaseRefreshLock } from "@/lib/auth/refreshLock"
import { createMainCategory, getAllActiveCategories } from "@/app/auth/auth-service/category.service"
import { getDefaultProductName, getDefaultProductKey, setDefaultProductKey } from "@/services/dashboard.service"
import { setDashboardMode, DASHBOARD_MODE_BUSINESS } from "@/services/dashboard.service"
import { getAuthAppUrl } from "@/lib/core/appUrls"
import useDebounce from "@/hooks/useDebounce"
import AuthCard1 from "@/components/ui/AuthCard1"
import AuthHeader from "@/components/ui/AuthHeader"
import Button from "@/components/ui/Button"
import AutoComplete from "@/components/ui/AutoComplete"
import SeanebIdField from "@/components/ui/SeanebId"
import OtpVerificationModal from "@/components/ui/OtpVerificationModal"
import TermsConditionsModal from "@/components/ui/TermsConditionsModal"
import AuthTransitionOverlay from "@/components/ui/AuthTransitionOverlay"
import useAuthSubmitTransition from "@/hooks/useAuthSubmitTransition"
import {
  getAuthFlowContext,
  ingestAuthFlowContextFromUrl,
  ingestAuthFlowContextFromWindowName,
  setAuthFlowContext,
  stripAuthFlowParamsFromAddressBar,
} from "@/lib/auth/flowContext"
import { useAuth } from "@/lib/auth/AuthContext"
import { getAllowedReturnOrigins, getPrimaryListingOrigin } from "@/lib/core/postLoginRedirect"
import {
  BRANCH_PAYMENT_BRANCH_ID_COOKIE,
  BRANCH_PAYMENT_ERROR_COOKIE,
  BRANCH_PAYMENT_ORDER_ID_COOKIE,
  BRANCH_PAYMENT_SESSION_ID_COOKIE,
  BRANCH_PAYMENT_STATUS_ACTIVE,
  BRANCH_PAYMENT_STATUS_FAILED,
  BRANCH_PAYMENT_STATUS_PENDING,
  BRANCH_PAYMENT_STATUS_COOKIE,
  normalizeBranchPaymentStatus,
} from "@/lib/payment/branchPaymentState"

// i18n
import eng from "@/constants/i18/eng/business_register.json"
import guj from "@/constants/i18/guj/business_register.json"
import hindi from "@/constants/i18/hindi/business_register.json"

const LANG_MAP = { eng, guj, hindi }

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const MOBILE_REGEX = /^[0-9]{8,15}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PURPOSE_BUSINESS_MOBILE_VERIFY = 2
const PURPOSE_BUSINESS_EMAIL_VERIFY = 3
const MAIN_APP_REGISTER_SOURCE = "main-app-register"
const BUSINESS_REGISTER_SUCCESS_MESSAGE_TYPE = "SEANEB_BUSINESS_REGISTER_SUCCESS"
const DEFAULT_MAIN_CATEGORY_ID = ""
const OTP_VIA_WHATSAPP = "whatsapp"
const OTP_VIA_SMS = "sms"
const RESEND_COOLDOWN_SECONDS = 60
const VERIFIED_EDIT_COOLDOWN_SECONDS = 60
const TERMS_TEXT_PATH = "/legal/terms-conditions-property.txt"
const LANGUAGE_STORAGE_KEY = "auth_language"
const DEFAULT_BUSINESS_IMAGE = "/default-business.png"
const GOOGLE_PLACES_API_KEY = ""
const GOOGLE_PLACES_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo"
const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
const AUTH_DEBUG = false
const POST_REGISTER_PROFILE_MAX_ATTEMPTS = 6
const POST_REGISTER_PROFILE_RETRY_MS = 350
const PAYMENT_POLL_INTERVAL_MS = 2500
const PAYMENT_POLL_TIMEOUT_MS = 3 * 60 * 1000
const CASHFREE_REDIRECT_TARGET_MODAL = "_modal"

const logAuthDebug = (...args) => {
  if (!AUTH_DEBUG || typeof console === "undefined") return
  console.debug(...args)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const createTaggedError = (message, code) => {
  const error = new Error(message)
  error.code = code
  return error
}

const buildCsrfHeaders = (token) => {
  const csrfToken = String(token || "").trim()
  return {
    "x-csrf-token": csrfToken,
    "x-xsrf-token": csrfToken,
    "csrf-token": csrfToken,
  }
}

const formatMessage = (template, values = {}) => {
  let output = String(template || "")

  for (const [key, value] of Object.entries(values)) {
    output = output.split(`{${key}}`).join(String(value))
  }

  return output
}

const EMPTY_FORM = {
  businessName: "",
  displayName: "",
  mainCategoryId: DEFAULT_MAIN_CATEGORY_ID,
  businessType: "",
  seanebId: "",
  primaryNumber: "",
  whatsappNumber: "",
  businessWebsite: "",
  businessEmail: "",
  aboutBranch: "",
  businessLocation: "",
  placeId: "",
  cityId: "",
  latitude: "",
  longitude: "",
  businessPlaceId: "",
  photoReference: "",
  landmark: "",
  pan: "",
  gstin: "",
  agree: false,
}

const getErrorMessage = (err, fallback) =>
  err?.response?.data?.error?.message ||
  err?.response?.data?.message ||
  err?.message ||
  fallback

const extractPayload = (payload = null) =>
  payload?.data || payload?.result || payload?.payload || payload || {}

const extractPaymentSessionId = (payload = null) => {
  const data = extractPayload(payload)
  const sessionId =
    data?.payment_session_id ||
    data?.paymentSessionId ||
    data?.payment_session?.id ||
    payload?.payment_session_id ||
    payload?.paymentSessionId

  return String(sessionId || "").trim()
}

const extractOrderId = (payload = null) => {
  const data = extractPayload(payload)
  const orderId =
    data?.order_id ||
    data?.orderId ||
    data?.payment_order_id ||
    data?.paymentOrderId ||
    data?.cf_order_id ||
    data?.cfOrderId ||
    data?.order?.id ||
    data?.order?.order_id ||
    data?.order?.orderId ||
    payload?.order_id ||
    payload?.orderId

  return String(orderId || "").trim()
}

const extractOnboardingChargePreview = (payload = null) => {
  const data = extractPayload(payload)
  const baseAmount = Number(data?.base_amount ?? data?.baseAmount ?? 0)
  const gstPercentage = Number(data?.gst_percentage ?? data?.gstPercentage ?? 0)

  return {
    description: String(data?.description || "").trim(),
    baseAmount: Number.isFinite(baseAmount) ? baseAmount : 0,
    gstPercentage: Number.isFinite(gstPercentage) ? gstPercentage : 0,
  }
}

const formatInr = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

const getCashfreeMode = () => {
  if (typeof window !== "undefined") {
    const hostname = String(window.location.hostname || "").trim().toLowerCase()
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("dev.") ||
      hostname.includes("staging")
    ) {
      return "sandbox"
    }
  }

  return process.env.NODE_ENV === "production" ? "production" : "sandbox"
}

const getCategoryId = (category) =>
  String(category?.main_category_id || category?.category_id || category?.id || "").trim()

const getCategoryName = (category) =>
  String(category?.main_category_name || category?.category_name || category?.name || "").trim()

const normalizeBusinessLabel = (value) =>
  String(value || "")
    .split(",")[0]
    .trim()
    .slice(0, 30)

const normalizeMobileNumber = (value) =>
  String(value || "")
    .replace(/\D/g, "")
    .trim()

const getBusinessSuggestionLabel = (item) =>
  String(
    item?.description ||
      item?.name ||
      item?.business_name ||
      item?.structured_formatting?.main_text ||
      ""
  ).trim()

const getBusinessSuggestionPlaceId = (item) =>
  String(item?.business_place_id || item?.place_id || item?.id || "").trim()

const getBusinessSuggestionPhotoReference = (item) => {
  const direct = item?.photo_reference || item?.photoReference
  const fromArray =
    item?.photo_references?.[0] ||
    item?.photoReferences?.[0] ||
    item?.photo_reference_list?.[0]
  const fromPhotos =
    item?.photos?.[0]?.photo_reference || item?.photos?.[0]?.photoReference
  const fromPhoto = item?.photo?.photo_reference || item?.photo?.photoReference
  return String(direct || fromArray || fromPhotos || fromPhoto || "").trim()
}

const buildBusinessPhotoUrl = (photoReference, maxWidth = 80) => {
  const reference = String(photoReference || "").trim()
  if (!reference || !GOOGLE_PLACES_API_KEY) return DEFAULT_BUSINESS_IMAGE

  const params = new URLSearchParams({
    maxwidth: String(maxWidth),
    photo_reference: reference,
    key: GOOGLE_PLACES_API_KEY,
  })

  return `${GOOGLE_PLACES_PHOTO_URL}?${params.toString()}`
}

const LOCAL_GEOMETRY_ENDPOINT = "/api/places/geometry"

const fetchPlaceGeometryFromServer = async (placeId, query = "") => {
  const id = String(placeId || "").trim()
  if (!id) return { lat: "", lng: "" }

  try {
    const params = new URLSearchParams({ place_id: id })
    const safeQuery = String(query || "").trim()
    if (safeQuery) {
      params.set("query", safeQuery)
    }
    const url = `${LOCAL_GEOMETRY_ENDPOINT}?${params.toString()}`
    const response = await fetch(url, { method: "GET", cache: "no-store" })
    const data = await response.json().catch(() => ({}))
    const location = data?.location || data?.result?.geometry?.location || data?.geometry?.location
    const lat = data?.lat ?? location?.lat
    const lng = data?.lng ?? location?.lng
    return {
      lat: Number.isFinite(Number(lat)) ? Number(lat) : "",
      lng: Number.isFinite(Number(lng)) ? Number(lng) : "",
    }
  } catch {
    return { lat: "", lng: "" }
  }
}

const fetchPlaceGeometry = async (placeId, query = "") => {
  const id = String(placeId || "").trim()
  if (!id) return { lat: "", lng: "" }

  if (GOOGLE_PLACES_API_KEY) {
    try {
      const params = new URLSearchParams({
        place_id: id,
        fields: "geometry",
        key: GOOGLE_PLACES_API_KEY,
      })
      const response = await fetch(`${GOOGLE_PLACES_DETAILS_URL}?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      })
      const data = await response.json().catch(() => ({}))
      const location = data?.result?.geometry?.location
      const lat = location?.lat
      const lng = location?.lng
      const direct = {
        lat: Number.isFinite(Number(lat)) ? Number(lat) : "",
        lng: Number.isFinite(Number(lng)) ? Number(lng) : "",
      }
      if (hasMeaningfulCoordinates(direct.lat, direct.lng)) {
        return direct
      }
    } catch {
      // fall back to server-side lookup
    }
  }

  return fetchPlaceGeometryFromServer(id, query)
}

const normalizeCoordinate = (value) => {
  if (value === "" || value === null || value === undefined) return ""
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : ""
}

const hasMeaningfulCoordinates = (lat, lng) => {
  const normalizedLat = normalizeCoordinate(lat)
  const normalizedLng = normalizeCoordinate(lng)
  if (normalizedLat === "" || normalizedLng === "") return false
  return !(normalizedLat === 0 && normalizedLng === 0)
}

const getResolvedCountryCode = () => {
  const verifiedBusinessMobile = getJsonCookie("verified_business_mobile")
  const fromBusinessMobile = String(verifiedBusinessMobile?.country_code || "").trim()
  if (fromBusinessMobile) return fromBusinessMobile

  const verifiedMobile = getJsonCookie("verified_mobile")
  const fromVerifiedMobile = String(verifiedMobile?.country_code || "").trim()
  if (fromVerifiedMobile) return fromVerifiedMobile

  const fromOtpCookie = String(getCookie("otp_cc") || "").trim()
  if (fromOtpCookie) return fromOtpCookie

  return ""
}

const normalizeCountryCode = (value) => String(value || "").replace(/\D/g, "").trim()

const getCountryByCode = (value) => {
  const normalized = normalizeCountryCode(value)
  if (!normalized) return null
  return phoneCodes.find((country) => normalizeCountryCode(country?.dialCode) === normalized) || null
}

const COUNTRY_OPTIONS = phoneCodes
  .map((country) => ({
    name: String(country?.name || "").trim() || "Unknown",
    dialCode: String(country?.dialCode || "").trim(),
    flag: String(country?.flag || "").trim(),
  }))
  .filter((country) => country.dialCode)

const DEFAULT_COUNTRY =
  getCountryByCode("91") ||
  phoneCodes[0] || { name: "India", dialCode: "+91" }

const buildWizardSteps = (labels = {}) => [
  { id: 1, title: String(labels.stepBasicInfo || "Basic Info") },
  { id: 2, title: String(labels.stepContact || "Contact") },
  { id: 3, title: String(labels.stepAddress || "Address") },
  { id: 4, title: String(labels.stepCompliance || "Compliance") },
  { id: 5, title: String(labels.stepPayment || "Payment") },
]

const getOtpChannelLabel = (via, labels = {}) =>
  via === OTP_VIA_SMS
    ? String(labels.sms || "SMS")
    : String(labels.whatsapp || "WhatsApp")

const resolveListingOrigin = (returnTo = "") => {
  const allowedOrigins = getAllowedReturnOrigins()
  const primaryOrigin = getPrimaryListingOrigin()
  const fallback = primaryOrigin || ""
  const target = String(returnTo || "").trim()

  if (!target) return fallback

  try {
    const parsed = target.startsWith("/") && primaryOrigin
      ? new URL(target, primaryOrigin)
      : new URL(target)

    if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
      return fallback
    }

    if (!allowedOrigins.length && !primaryOrigin) {
      return ""
    }

    return parsed.origin
  } catch {
    return fallback
  }
}

const resolveListingDestination = (returnTo = "") => {
  const allowedOrigins = getAllowedReturnOrigins()
  const primaryOrigin = getPrimaryListingOrigin()
  const fallbackPath = "/dashboard/broker"
  const fallback = primaryOrigin
    ? new URL(fallbackPath, primaryOrigin).toString()
    : fallbackPath
  const target = String(returnTo || "").trim()

  if (!target) return fallback

  try {
    if (target.startsWith("/") && primaryOrigin) {
      return new URL(target, primaryOrigin).toString()
    }

    const parsed = new URL(target)
    if (!/^https?:$/i.test(parsed.protocol)) return fallback

    if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
      return fallback
    }

    if (!allowedOrigins.length && primaryOrigin && parsed.origin !== primaryOrigin) {
      return fallback
    }

    return parsed.toString()
  } catch {
    return fallback
  }
}

const notifyListingApp = ({ businessId = "", branchId = "" } = {}) => {
  if (typeof window === "undefined") return false
  const { source, returnTo } = getAuthFlowContext()
  if (source !== MAIN_APP_REGISTER_SOURCE) return false

  const targetOrigin = resolveListingOrigin(returnTo)
  if (!targetOrigin) return false

  if (!window.opener || window.opener.closed) return false

  try {
    window.opener.postMessage(
      {
        type: BUSINESS_REGISTER_SUCCESS_MESSAGE_TYPE,
        payload: {
          authCode: "",
          businessId: String(businessId || ""),
          branchId: String(branchId || ""),
        },
      },
      targetOrigin
    )
    return true
  } catch {
    return false
  }
}

const finalizeRegistration = ({ router, businessId = "", branchId = "" } = {}) => {
  notifyListingApp({ businessId, branchId })
  const { returnTo } = getAuthFlowContext()
  const destination = resolveListingDestination(returnTo)

  if (typeof window !== "undefined") {
    window.location.replace(destination)
    return
  }

  router.replace("/dashboard/broker")
}

const redirectToBusinessRegisterLogin = (router, returnTo = "/auth/business-register") => {
  setAuthFlowContext({
    source: MAIN_APP_REGISTER_SOURCE,
    returnTo,
  })
  router.replace(getAuthAppUrl("/auth/login"))
}

const hasBusinessRegistration = (payload = null) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.payload,
    payload?.response,
    payload?.session,
    payload?.user,
    payload?.profile,
    payload?.business,
    payload?.data?.user,
    payload?.data?.profile,
    payload?.data?.business,
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue

    const boolHints = [
      candidate?.is_business_registered,
      candidate?.isBusinessRegistered,
      candidate?.business_registered,
      candidate?.businessRegistered,
      candidate?.has_business,
      candidate?.hasBusiness,
    ]
    if (boolHints.some((value) => value === true || String(value || "").trim().toLowerCase() === "true")) {
      return true
    }

    const idHints = [
      candidate?.business_id,
      candidate?.businessId,
      candidate?.current_business_id,
      candidate?.currentBusinessId,
      candidate?.branch_id,
      candidate?.branchId,
      candidate?.business?.id,
      candidate?.business?.business_id,
    ]
    if (idHints.some((value) => String(value || "").trim().length > 0)) {
      return true
    }
  }

  return false
}

const readProfileRecord = (payload = null) => {
  const profile =
    payload?.data?.profile ||
    payload?.data?.user ||
    payload?.data ||
    payload?.profile ||
    payload?.user ||
    payload

  return profile && typeof profile === "object" ? profile : null
}

const readProfileBranchId = (profile = null) =>
  String(
    profile?.branch_id ||
      profile?.branchId ||
      profile?.default_branch_id ||
      profile?.defaultBranchId ||
      profile?.business?.branch_id ||
      profile?.business?.branchId ||
      profile?.business?.default_branch_id ||
      profile?.business?.defaultBranchId ||
      ""
  ).trim()

const readProfileBranchStatus = (profile = null) =>
  normalizeBranchPaymentStatus(
    profile?.branch_status ||
      profile?.branchStatus ||
      profile?.current_branch_status ||
      profile?.currentBranchStatus ||
      profile?.default_branch_status ||
      profile?.defaultBranchStatus ||
      profile?.branch?.status ||
      profile?.current_branch?.status ||
      profile?.currentBranch?.status ||
      profile?.default_branch?.status ||
      profile?.defaultBranch?.status ||
      profile?.business?.branch_status ||
      profile?.business?.branchStatus ||
      ""
  )

const BUSINESS_HINT_COOKIE_KEYS = [
  "business_registered",
  "business_id",
  "branch_id",
  "business_name",
  "display_name",
  "business_type",
  "business_location",
  "business_email",
  "about_branch",
  BRANCH_PAYMENT_STATUS_COOKIE,
  BRANCH_PAYMENT_BRANCH_ID_COOKIE,
  BRANCH_PAYMENT_ORDER_ID_COOKIE,
  BRANCH_PAYMENT_SESSION_ID_COOKIE,
  BRANCH_PAYMENT_ERROR_COOKIE,
  "dashboard_mode",
]

const clearBusinessRegistrationHints = () => {
  BUSINESS_HINT_COOKIE_KEYS.forEach((key) => removeCookie(key))
}

export default function BusinessRegisterPage() {
  const router = useRouter()
  const { applyUserProfile, user } = useAuth()
  const [language, setLanguage] = useState(() => {
    if (typeof window !== "undefined") {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      if (savedLanguage && LANG_MAP[savedLanguage]) {
        return savedLanguage
      }
    }
    return "eng"
  })
  const [form, setForm] = useState(EMPTY_FORM)
  const [mounted, setMounted] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const { isTransitioning, showTransition, runWithTransition, stopTransition } = useAuthSubmitTransition()
  const [branchId, setBranchId] = useState("")
  const [panVerified, setPanVerified] = useState(false)
  const [gstVerified, setGstVerified] = useState(false)
  const [verifyingPan, setVerifyingPan] = useState(false)
  const [verifyingGst, setVerifyingGst] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailEditCooldown, setEmailEditCooldown] = useState(0)
  const [mobileVerified, setMobileVerified] = useState(false)
  const [mobileLoading, setMobileLoading] = useState(false)
  const [mobileEditCooldown, setMobileEditCooldown] = useState(0)
  const [mobileOtpVia, setMobileOtpVia] = useState(OTP_VIA_SMS)
  const [whatsappVerified, setWhatsappVerified] = useState(false)
  const [whatsappAutoVerified, setWhatsappAutoVerified] = useState(false)
  const [whatsappLoading, setWhatsappLoading] = useState(false)
  const [whatsappEditCooldown, setWhatsappEditCooldown] = useState(0)
  const [selectedCountry, setSelectedCountry] = useState(() => {
    const fromSession = getResolvedCountryCode()
    return getCountryByCode(fromSession) || DEFAULT_COUNTRY
  })
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [otpModalType, setOtpModalType] = useState("")
  const [otpModalTarget, setOtpModalTarget] = useState("")
  const [otpValue, setOtpValue] = useState("")
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpResending, setOtpResending] = useState(false)
  const [otpResendCooldown, setOtpResendCooldown] = useState(0)
  const [otpError, setOtpError] = useState("")
  const [otpClearSignal, setOtpClearSignal] = useState(0)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [seanebVerified, setSeanebVerified] = useState(false)
  const [panStatusText, setPanStatusText] = useState("")
  const [gstStatusText, setGstStatusText] = useState("")
  const [businessSuggestions, setBusinessSuggestions] = useState([])
  const [businessSuggestOpen, setBusinessSuggestOpen] = useState(false)
  const [businessSuggestLoading, setBusinessSuggestLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [productCategoryId, setProductCategoryId] = useState("")
  const [currentStep, setCurrentStep] = useState(1)
  const [onboardingChargePreview, setOnboardingChargePreview] = useState(null)
  const [loadingOnboardingCharge, setLoadingOnboardingCharge] = useState(false)
  const [paymentLaunching, setPaymentLaunching] = useState(false)
  const [paymentAwaitingConfirmation, setPaymentAwaitingConfirmation] = useState(false)
  const [paymentNotice, setPaymentNotice] = useState("")
  const [pendingPaymentContext, setPendingPaymentContext] = useState(null)
  const sectionTopRef = useRef(null)
  const lockedProductKeyRef = useRef("")
  const suppressNextBusinessAutocompleteRef = useRef(false)
  const initAttemptedRef = useRef(false)
  const profileProbeAttemptedRef = useRef(false)
  const debouncedBusinessName = useDebounce(form.businessName, 300)
  const locationLookupRef = useRef("")

  const t = LANG_MAP[language] || eng
  const text = useCallback((key, fallback) => String(t?.[key] || fallback), [t])
  const textf = useCallback(
    (key, fallback, values = {}) => formatMessage(text(key, fallback), values),
    [text]
  )
  const reportPaymentFlow = useCallback(async ({
    event = "",
    branchId = "",
    businessId = "",
    orderId = "",
    sessionId = "",
    status = "",
    error = "",
    details = null,
  } = {}) => {
    try {
      await fetch("/api/payment/flow", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          event,
          branchId,
          businessId,
          orderId,
          sessionId,
          status,
          error,
          source: "business-register",
          details: details && typeof details === "object" ? details : null,
        }),
      })
    } catch (logError) {
      console.warn("[business-register] payment flow log failed:", logError)
    }
  }, [])
  const wizardSteps = buildWizardSteps(t)
  const currentStepMeta = wizardSteps.find((step) => step.id === currentStep) || wizardSteps[0]
  const completionPercent = Math.round((currentStep / wizardSteps.length) * 100)
  const defaultAboutBranch = text("defaultAboutBranch", "Head office branch")
  const paymentPreviewReady = Boolean(onboardingChargePreview)
  const isPaymentStepReady = pendingPaymentContext?.paymentSessionId
    ? true
    : form.businessLocation.trim().length > 0 &&
      form.placeId.trim().length > 0 &&
      form.agree &&
      paymentPreviewReady &&
      !loadingOnboardingCharge
  const normalizedPrimaryNumber = normalizeMobileNumber(form.primaryNumber)
  const normalizedWhatsappNumber = normalizeMobileNumber(form.whatsappNumber)
  const isWhatsappSameAsPrimary =
    Boolean(normalizedPrimaryNumber) &&
    Boolean(normalizedWhatsappNumber) &&
    normalizedPrimaryNumber === normalizedWhatsappNumber
  const whatsappIsVerified = whatsappVerified || whatsappAutoVerified
  const hasSelectedBusiness = Boolean(form.businessPlaceId || form.photoReference)
  const selectedBusinessPhotoSrc = buildBusinessPhotoUrl(form.photoReference, 200)
  const onboardingBaseAmount = Number(onboardingChargePreview?.baseAmount || 0)
  const onboardingGstPercentage = Number(onboardingChargePreview?.gstPercentage || 0)
  const onboardingGstAmount = (onboardingBaseAmount * onboardingGstPercentage) / 100
  const onboardingTotalAmount = onboardingBaseAmount + onboardingGstAmount

  useEffect(() => {
    const knownDefaults = new Set(
      [
        "",
        "Head office branch",
        eng.defaultAboutBranch,
        guj.defaultAboutBranch,
        hindi.defaultAboutBranch,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )

    setForm((prev) => {
      const currentValue = String(prev.aboutBranch || "").trim()
      if (!knownDefaults.has(currentValue)) return prev
      if (currentValue === defaultAboutBranch) return prev

      return {
        ...prev,
        aboutBranch: defaultAboutBranch,
      }
    })
  }, [defaultAboutBranch])

  const ensureAuthSessionReady = useCallback(async () => {
    const hasAccessToken = () => Boolean(String(getAccessToken() || "").trim())
    const hasCsrfToken = () =>
      Boolean(String(getCsrfToken() || getCookie("csrf_token_property") || "").trim())
    const hasUsableSession = () => hasAccessToken() && hasCsrfToken()

    const tryRefreshAccessToken = async () => {
      try {
        await refreshAccessToken()
        return true
      } catch (err) {
        const code = String(err?.response?.data?.code || err?.data?.code || "").trim().toUpperCase()
        if (code === "REFRESH_LIMIT_REACHED") {
          clearRefreshBudget()
          try {
            await refreshAccessToken()
            return true
          } catch {
            return false
          }
        }
        return false
      }
    }

    if (hasUsableSession()) return true

    let hint = null
    try {
      hint = await getSessionHint({ force: true })
    } catch {
      hint = null
    }

    const hasRecoverableSession =
      Boolean(hint?.hasRefreshSession) || hasAccessToken()

    if (hasRecoverableSession && !hasUsableSession()) {
      await tryRefreshAccessToken()
    }

    if (hasUsableSession()) return true

    try {
      const waitResult = await waitForAuthCookies()
      if (waitResult?.ok) {
        if (!hasUsableSession()) {
          await tryRefreshAccessToken()
        }
        return hasUsableSession()
      }
    } catch {
      // ignore cookie wait failures
    }

    try {
      const finalHint = await getSessionHint({ force: true })
      if (finalHint?.hasRefreshSession || hasAccessToken()) {
        if (!hasUsableSession()) {
          await tryRefreshAccessToken()
        }
        return hasUsableSession()
      }
    } catch {
      // ignore session hint failures
    }

    return hasUsableSession()
  }, [])

  const confirmRegisteredBusinessProfile = useCallback(async ({ expectedBranchId = "" } = {}) => {
    const expectedBranch = String(expectedBranchId || "").trim()
    let lastStatus = 0
    let lastMessage = ""

    const tryManualRefresh = async () => {
      try {
        const productKey = String(getDefaultProductKey() || "property").trim()
        const csrfToken = String(getCsrfToken() || "").trim()
        const refreshUrl = `${String(API_BASE_URL || "").trim().replace(/\/+$/, "") || "/api"}/auth/refresh`
        const refreshLock = await acquireRefreshLock({ source: "business-register" })
        if (!refreshLock.acquired) {
          throw new Error("Refresh lock unavailable")
        }

        let refreshResp
        try {
          refreshResp = await fetch(refreshUrl, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: {
              "content-type": "application/json",
              "x-product-key": productKey,
              ...buildCsrfHeaders(csrfToken),
            },
            body: JSON.stringify({ product_key: productKey }),
          })
        } finally {
          releaseRefreshLock(refreshLock.id)
        }

        let refreshPayload = null
        try {
          refreshPayload = await refreshResp.clone().json()
        } catch {
          refreshPayload = null
        }

        const respAuth = String(
          refreshResp.headers.get("authorization") || refreshResp.headers.get("Authorization") || ""
        ).trim()
        const respHeaderToken = respAuth && /^Bearer\s+/i.test(respAuth)
          ? respAuth.replace(/^Bearer\s+/i, "").trim()
          : respAuth

        const respBodyToken = String(
          refreshPayload?.access_token || refreshPayload?.accessToken || refreshPayload?.token || refreshPayload?.jwt || ""
        ).trim()

        const respCsrf = String(
          refreshResp.headers.get("x-csrf-token") ||
            refreshResp.headers.get("x-xsrf-token") ||
            refreshResp.headers.get("csrf-token") ||
            refreshPayload?.csrf_token ||
            refreshPayload?.csrfToken ||
            ""
        ).trim()

        if (respHeaderToken || respBodyToken || respCsrf) {
          hydrateAuthSession({
            accessToken: respHeaderToken || respBodyToken,
            csrfToken: respCsrf,
            broadcast: true,
          })
        }

        return await ensureAuthSessionReady()
      } catch (manualRefreshError) {
        console.warn("[business-register] manual refresh attempt failed:", manualRefreshError)
        return false
      }
    }

    for (let attempt = 0; attempt < POST_REGISTER_PROFILE_MAX_ATTEMPTS; attempt += 1) {
      let sessionHydrated = false

      try {
        sessionHydrated = await ensureAuthSessionReady()
        if (!sessionHydrated) {
          const waitResult = await waitForAuthCookies()
          if (waitResult?.ok) {
            sessionHydrated = await ensureAuthSessionReady()
          }
        }
      } catch {
        sessionHydrated = false
      }

      if (!sessionHydrated) {
        sessionHydrated = await tryManualRefresh()
      }

      if (sessionHydrated) {
        try {
          const payload = await authApi.me({ retryOn401: false })
          const profile = readProfileRecord(payload)
          const profileBranchId = readProfileBranchId(profile)
          const profileBranchStatus = readProfileBranchStatus(profile)
          const hasMatchingBranch =
            (expectedBranch && profileBranchId === expectedBranch) ||
            (!expectedBranch && hasBusinessRegistration(profile))
          const hasActiveBusinessProfile =
            hasMatchingBranch && profileBranchStatus === BRANCH_PAYMENT_STATUS_ACTIVE

          if (profile && hasActiveBusinessProfile) {
            applyUserProfile(profile)
            notifyAuthChanged({ force: true })
            return true
          }

          lastStatus = 200
          lastMessage = profileBranchStatus || "PROFILE_BRANCH_NOT_ACTIVE"
        } catch (profileError) {
          lastStatus = Number(profileError?.status || profileError?.response?.status || 0)
          lastMessage = String(
            profileError?.data?.error?.message ||
              profileError?.data?.message ||
              profileError?.response?.data?.error?.message ||
              profileError?.response?.data?.message ||
              profileError?.message ||
              ""
          ).trim()
        }
      }

      if (attempt < POST_REGISTER_PROFILE_MAX_ATTEMPTS - 1) {
        await sleep(POST_REGISTER_PROFILE_RETRY_MS * (attempt + 1))
      }
    }

    console.warn("[business-register] unable to confirm /api/auth/me after registration", {
      status: lastStatus,
      message: lastMessage || "profile_not_ready",
      expectedBranchId: expectedBranch,
    })

    return false
  }, [applyUserProfile, ensureAuthSessionReady])

  const applySuccessfulBusinessRegistration = useCallback(async ({
    businessId = "",
    createdBranchId = "",
    businessName = "",
    displayName = "",
    businessType = "",
    businessEmail = "",
    aboutBranch = "",
    businessLocation = "",
    pan = "",
    gstin = "",
  } = {}) => {
    const normalizedBusinessId = String(businessId || "").trim()
    const normalizedBranchId = String(createdBranchId || "").trim()
    const normalizedPan = String(pan || "").trim().toUpperCase()
    const normalizedGstin = String(gstin || "").trim().toUpperCase()

    setBranchId(normalizedBranchId)

    if (normalizedBranchId && normalizedPan && !panVerified && PAN_REGEX.test(normalizedPan)) {
      try {
        await verifyPanForBranch({ pan: normalizedPan, branch_id: normalizedBranchId })
        setPanVerified(true)
        setPanStatusText("PAN verified successfully.")
        setCookie("verified_pan", normalizedPan, { maxAge: 60 * 60 * 24 * 7, path: "/" })
      } catch {
        setPanStatusText("PAN could not be verified right now. You can retry from dashboard.")
      }
    }

    if (normalizedBranchId && normalizedGstin && !gstVerified && GST_REGEX.test(normalizedGstin)) {
      try {
        await verifyGstForBranch({ gstin: normalizedGstin, branch_id: normalizedBranchId })
        setGstVerified(true)
        setGstStatusText("GSTIN verified successfully.")
        setCookie("verified_gstin", normalizedGstin, { maxAge: 60 * 60 * 24 * 7, path: "/" })
      } catch {
        setGstStatusText("GSTIN could not be verified right now. You can retry from dashboard.")
      }
    }

    setCookie("business_name", businessName, { path: "/" })
    setCookie("display_name", displayName, { path: "/" })
    setCookie("business_type", businessType, { path: "/" })
    setCookie("business_email", businessEmail, { path: "/" })
    setCookie("about_branch", aboutBranch, { path: "/" })
    setCookie("business_location", businessLocation, { path: "/" })
    setCookie("business_id", normalizedBusinessId, { path: "/" })
    setCookie("branch_id", normalizedBranchId, { path: "/" })
    setCookie("business_registered", "true", {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })
    setDashboardMode(DASHBOARD_MODE_BUSINESS)

    setCookie("profile_completed", "true", {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })

    const profileConfirmed = await confirmRegisteredBusinessProfile({
      expectedBranchId: normalizedBranchId,
    })

    return {
      profileConfirmed,
      businessId: normalizedBusinessId,
      branchId: normalizedBranchId,
    }
  }, [confirmRegisteredBusinessProfile, gstVerified, panVerified])

  const hydrateRegistrationTokens = useCallback((response) => {
    const data = response?.data || response || {}

    try {
      const headers = response?.headers || {}
      const headerCandidates = [
        headers?.authorization,
        headers?.Authorization,
        headers["authorization"],
        headers["Authorization"],
        headers["x-access-token"],
        headers["x-access_token"],
        headers["x-access-token"],
        headers["access-token"],
        headers["access_token"],
        headers["x-auth-token"],
      ]
      let headerAuth = ""
      for (const headerValue of headerCandidates) {
        if (!headerValue) continue
        headerAuth = String(headerValue || "").trim()
        if (headerAuth) break
      }

      const headerToken = headerAuth && /^Bearer\s+/i.test(headerAuth)
        ? headerAuth.replace(/^Bearer\s+/i, "").trim()
        : headerAuth

      const bodyToken = String(
        data?.access_token || data?.accessToken || data?.token || data?.jwt || ""
      ).trim()

      const headerCsrf = String(
        headers?.["x-csrf-token"] || headers?.["x-xsrf-token"] || headers?.["x-csrf_token"] || headers?.["x-csrf"] || ""
      ).trim()

      const bodyCsrf = String(
        data?.csrf_token || data?.csrfToken || data?.csrf || ""
      ).trim()

      const finalToken = headerToken || bodyToken || ""
      const finalCsrf = headerCsrf || bodyCsrf || ""

      if (finalToken || finalCsrf) {
        hydrateAuthSession({ accessToken: finalToken, csrfToken: finalCsrf, broadcast: true })
      }
    } catch {
      // Ignore token extraction failures; registration fallback handling already covers missing auth.
    }
  }, [])

  const completeSuccessfulRegistration = useCallback(async ({
    businessId = "",
    createdBranchId = "",
    orderId = "",
    paymentSessionId = "",
    businessName = "",
    displayName = "",
    businessType = "",
    businessEmail = "",
    aboutBranch = "",
    businessLocation = "",
    pan = "",
    gstin = "",
  } = {}) => {
    const registrationState = await applySuccessfulBusinessRegistration({
      businessId,
      createdBranchId,
      businessName,
      displayName,
      businessType,
      businessEmail,
      aboutBranch,
      businessLocation,
      pan,
      gstin,
    })

    if (!registrationState?.profileConfirmed) {
      await reportPaymentFlow({
        event: "payment_confirmation_failed",
        branchId: createdBranchId || registrationState?.branchId,
        businessId: businessId || registrationState?.businessId,
        orderId,
        sessionId: paymentSessionId,
        status: BRANCH_PAYMENT_STATUS_FAILED,
        error: "Branch remained non-active after payment confirmation.",
      })
      return false
    }

    await reportPaymentFlow({
      event: "payment_confirmed",
      branchId: registrationState.branchId,
      businessId: registrationState.businessId,
      orderId,
      sessionId: paymentSessionId,
      status: BRANCH_PAYMENT_STATUS_ACTIVE,
    })

    finalizeRegistration({
      router,
      businessId: registrationState.businessId,
      branchId: registrationState.branchId,
    })
    return true
  }, [applySuccessfulBusinessRegistration, reportPaymentFlow, router])

  const readTrackedPaymentState = useCallback(async ({
    branchId = "",
    orderId = "",
    sessionId = "",
  } = {}) => {
    if (typeof window === "undefined") {
      return { status: "", tracked: null }
    }

    const url = new URL("/api/payment/flow", window.location.origin)
    if (branchId) url.searchParams.set("branchId", branchId)
    if (orderId) url.searchParams.set("orderId", orderId)
    if (sessionId) url.searchParams.set("sessionId", sessionId)

    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error("Unable to read tracked payment state.")
    }

    const payload = await response.json().catch(() => ({}))
    return {
      status: String(payload?.status || payload?.tracked?.status || "").trim().toUpperCase(),
      tracked: payload?.tracked || null,
    }
  }, [])

  const waitForTrackedPaymentResolution = useCallback(async ({
    branchId = "",
    orderId = "",
    paymentSessionId = "",
  } = {}) => {
    const startedAt = Date.now()
    let lastTrackedError = null

    while (Date.now() - startedAt < PAYMENT_POLL_TIMEOUT_MS) {
      try {
        const trackedState = await readTrackedPaymentState({
          branchId,
          orderId,
          sessionId: paymentSessionId,
        })
        const trackedStatus = trackedState.status

        if (trackedStatus === BRANCH_PAYMENT_STATUS_ACTIVE) {
          return trackedState
        }

        if (trackedStatus === BRANCH_PAYMENT_STATUS_FAILED) {
          const trackedMessage =
            String(trackedState?.tracked?.error || "").trim() ||
            text("errorPaymentFailed", "Payment could not be completed. Please try again.")
          throw createTaggedError(trackedMessage, "PAYMENT_TRACKED_FAILED")
        }
      } catch (error) {
        lastTrackedError = error
        if (String(error?.code || "").trim() === "PAYMENT_TRACKED_FAILED") {
          throw error
        }
      }

      await sleep(PAYMENT_POLL_INTERVAL_MS)
    }

    throw createTaggedError(
      text(
        "paymentConfirmationPending",
        "Payment is still being confirmed. Keep this page open, and click Continue payment if you already completed the checkout."
      ),
      "PAYMENT_CONFIRMATION_PENDING"
    )
  }, [readTrackedPaymentState, text])

  const startPayment = useCallback(async (sessionId) => {
    const paymentSessionId = String(sessionId || "").trim()

    if (!paymentSessionId) {
      throw new Error(text("errorPaymentUnavailable", "Payment session is unavailable right now."))
    }

    if (typeof window === "undefined" || typeof window.Cashfree !== "function") {
      throw new Error(
        text(
          "errorCashfreeUnavailable",
          "Cashfree checkout is unavailable right now. Please refresh and try again."
        )
      )
    }

    const cashfree = window.Cashfree({
      mode: getCashfreeMode(),
    })

    const result = await cashfree.checkout({
      paymentSessionId,
      redirectTarget: CASHFREE_REDIRECT_TARGET_MODAL,
    })

    if (result?.error) {
      throw new Error(
        result?.error?.message ||
          result?.error?.reason ||
          text("errorPaymentFailed", "Payment could not be completed. Please try again.")
      )
    }

    return result
  }, [text])

  useEffect(() => {
    if (currentStep !== 5) return

    let cancelled = false

    const loadOnboardingCharge = async () => {
      setLoadingOnboardingCharge(true)

      try {
        const sessionReady = await ensureAuthSessionReady()
        if (!sessionReady) {
          if (!cancelled) {
            setOnboardingChargePreview(null)
            setSubmitError(
              text(
                "errorSessionExpiredBeforePayment",
                "Session expired. Please login again before reviewing payment."
              )
            )
          }
          return
        }

        const response = await getOnboardingChargePreview()
        if (cancelled) return

        setOnboardingChargePreview(extractOnboardingChargePreview(response?.data || response))
        setSubmitError("")
      } catch (err) {
        if (cancelled) return
        setOnboardingChargePreview(null)
        setSubmitError(
          getErrorMessage(
            err,
            text("errorChargePreviewUnavailable", "Unable to load onboarding charge preview right now.")
          )
        )
      } finally {
        if (!cancelled) {
          setLoadingOnboardingCharge(false)
        }
      }
    }

    loadOnboardingCharge()

    return () => {
      cancelled = true
    }
  }, [currentStep, ensureAuthSessionReady, text])

  const validateStep = (step) => {
    if (step === 1) {
      if (!form.businessName.trim()) return text("validationBusinessNameContinue", "Enter business name to continue")
      if (!form.displayName.trim()) return text("validationDisplayNameContinue", "Enter display name to continue")
      if (!form.businessType) return text("validationBusinessTypeContinue", "Select business type to continue")
      if (!form.seanebId.trim()) return text("validationSeanebIdContinue", "Enter SeaNeB ID to continue")
      return ""
    }

    if (step === 2) {
      if (!form.primaryNumber.trim()) return text("validationPrimaryNumberContinue", "Enter primary number to continue")
      if (!MOBILE_REGEX.test(form.primaryNumber.trim())) {
        return text("validationPrimaryNumberValidContinue", "Enter a valid primary number to continue")
      }
      if (form.businessEmail.trim() && !EMAIL_REGEX.test(form.businessEmail.trim())) {
        return text("validationBusinessEmailValid", "Enter a valid business email or keep it empty")
      }
      return ""
    }

    if (step === 3) {
      if (!form.businessLocation.trim()) {
        return text("validationBusinessLocationContinue", "Enter business location to continue")
      }
      if (!form.placeId.trim()) {
        return text(
          "validationBusinessLocationAutocompleteContinue",
          "Select a valid location from autocomplete to continue"
        )
      }
      return ""
    }

    if (step === 4) {
      if (form.pan.trim() && !PAN_REGEX.test(form.pan.trim().toUpperCase())) {
        return text("validationPanValidOptional", "Enter a valid PAN number or leave it empty")
      }
      if (form.gstin.trim() && !GST_REGEX.test(form.gstin.trim().toUpperCase())) {
        return text("validationGstinValidOptional", "Enter a valid GSTIN number or leave it empty")
      }
      if (!form.agree) {
        return text("validationAgreeTerms", "You must agree to the terms and conditions")
      }
      return ""
    }

    if (step === 5) {
      if (loadingOnboardingCharge) {
        return text("validationPaymentLoading", "Loading onboarding charge preview. Please wait a moment.")
      }
      if (pendingPaymentContext?.paymentSessionId) {
        return ""
      }
      if (!paymentPreviewReady) {
        return text("validationPaymentPreviewUnavailable", "Onboarding charge preview is unavailable right now.")
      }
      return ""
    }

    return ""
  }

  const goNextStep = () => {
    const stepError = validateStep(currentStep)
    if (stepError) {
      setSubmitError(stepError)
      return
    }
    setSubmitError("")
    setCurrentStep((prev) => Math.min(prev + 1, wizardSteps.length))
  }
  const goPreviousStep = () => {
    if (pendingPaymentContext) return
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }
  const handleStepChange = (stepId) => {
    if (pendingPaymentContext && stepId !== currentStep) return
    if (stepId <= currentStep) {
      setCurrentStep(stepId)
      return
    }
    const stepError = validateStep(currentStep)
    if (stepError) {
      setSubmitError(stepError)
      return
    }
    setSubmitError("")
    setCurrentStep(stepId)
  }

  useEffect(() => {
    sectionTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [currentStep])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (LANG_MAP[language]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    }
  }, [language])

  useEffect(() => {
    if (!otpModalOpen || otpResendCooldown <= 0) return
    const timer = window.setInterval(() => {
      setOtpResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [otpModalOpen, otpResendCooldown])

  useEffect(() => {
    if (emailEditCooldown <= 0 && mobileEditCooldown <= 0 && whatsappEditCooldown <= 0) return
    const timer = window.setInterval(() => {
      setEmailEditCooldown((prev) => (prev > 0 ? prev - 1 : 0))
      setMobileEditCooldown((prev) => (prev > 0 ? prev - 1 : 0))
      setWhatsappEditCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [emailEditCooldown, mobileEditCooldown, whatsappEditCooldown])

  useEffect(() => {
    ingestAuthFlowContextFromWindowName()
    ingestAuthFlowContextFromUrl()
    stripAuthFlowParamsFromAddressBar()
  }, [ensureAuthSessionReady, router])

  useEffect(() => {
    let active = true
    let timer = null

    if (initAttemptedRef.current) {
      return () => {
        active = false
      }
    }
    initAttemptedRef.current = true

    const isSsoCallback = () => {
      try {
        return (
          typeof window !== "undefined" &&
          new URL(window.location.href).searchParams.has("bridge_token")
        )
      } catch {
        return false
      }
    }

    const init = async () => {
      const profileCompleted = getCookie("profile_completed")
      const hasSession = await ensureAuthSessionReady()
      if (!active) return

      if (!hasSession) {
        // Allow business registration page to be accessed by guests.
        // Continue initialization without forcing login redirect.
        console.info("[business-register] no session detected; continuing as guest")
      } else {
        if (!profileProbeAttemptedRef.current) {
          profileProbeAttemptedRef.current = true
          try {
            const payload = await authApi.me({ retryOn401: false })
            const profile = readProfileRecord(payload)
            if (profile) {
              applyUserProfile(profile)
            }
          } catch (profileProbeError) {
            const status = Number(profileProbeError?.status || profileProbeError?.response?.status || 0)
            const message = String(
              profileProbeError?.data?.error?.message ||
                profileProbeError?.data?.message ||
                profileProbeError?.response?.data?.error?.message ||
                profileProbeError?.response?.data?.message ||
                profileProbeError?.message ||
                ""
            ).trim()

            if (status === 403) {
              console.info("[business-register] /api/auth/me is branch-restricted before registration:", message || "forbidden")
            } else {
              console.warn("[business-register] initial /api/auth/me probe failed:", profileProbeError)
            }
          }
          if (!active) return
        }

        if (profileCompleted !== "true") {
          setCookie("profile_completed", "true", {
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
          })
        }
      }

      // Do not trust stale business cookies here. A previous user/session may have
      // left them behind, which causes a redirect loop into /dashboard/broker.
      const hasBusinessCookie = getCookie("business_registered") === "true"
      const existingBranchId = String(getCookie("branch_id") || "").trim()
      const existingTrackedBranchId = String(getCookie(BRANCH_PAYMENT_BRANCH_ID_COOKIE) || "").trim()
      const existingTrackedBranchStatus = String(getCookie(BRANCH_PAYMENT_STATUS_COOKIE) || "").trim()
      if (hasBusinessCookie || existingBranchId || existingTrackedBranchId || existingTrackedBranchStatus) {
        logAuthDebug("[business-register] clearing stale business hints before form init", {
          hasBusinessCookie,
          hasBranchId: Boolean(existingBranchId),
          hasTrackedBranchId: Boolean(existingTrackedBranchId),
          hasTrackedBranchStatus: Boolean(existingTrackedBranchStatus),
        })
        clearBusinessRegistrationHints()
      }

      const verifiedMobile = getJsonCookie("verified_mobile")
      const regDraft = getJsonCookie("reg_form_draft")
      const verifiedBusinessEmail = getCookie("verified_business_email")
      const verifiedPan = getCookie("verified_pan")
      const verifiedGstin = getCookie("verified_gstin")
      const verifiedWhatsapp = getJsonCookie("verified_business_whatsapp")
      const initialBusinessEmail =
        verifiedBusinessEmail ||
        getCookie("verified_email") ||
        getCookie("user_email") ||
        regDraft?.email ||
        ""

      let autoMainCategoryId = ""
      let createdCategoryId = ""
      const stableProductKey = String(getDefaultProductKey() || "").trim()
      if (stableProductKey) {
        lockedProductKeyRef.current = stableProductKey
        setDefaultProductKey(stableProductKey)
      }

      // Get the product name (e.g., "Property")
      const productName = getDefaultProductName()
      console.log("[business-register] Product name:", productName)

      // Step 1: Create category with product name
      console.log(`[business-register] Step 1: Attempting to create '${productName}' category...`)
      try {
        createdCategoryId = String(await createMainCategory(productName) || "").trim()
        console.log("[business-register] createMainCategory result:", createdCategoryId)
      } catch (createErr) {
        console.error("[business-register] Create category error:", {
          status: createErr?.response?.status,
          code: createErr?.response?.data?.error?.code,
          message: createErr?.message || createErr
        })
      }

      // Step 2: Fetch all categories (which should now include the newly created one)
      console.log("[business-register] Step 2: Fetching all categories...")
      try {
        const categoriesList = await getAllActiveCategories()
        console.log("[business-register] getAllActiveCategories returned:", {
          isArray: Array.isArray(categoriesList),
          length: categoriesList?.length || 0,
          data: categoriesList
        })

        if (Array.isArray(categoriesList) && categoriesList.length > 0) {
          // Keep only product-name categories to avoid cross-product category mismatch.
          const productNamedCategories = categoriesList.filter(
            (cat) => getCategoryName(cat).toLowerCase() === productName.toLowerCase()
          )

          const matchedCategory =
            productNamedCategories.find((cat) => getCategoryId(cat) === createdCategoryId) ||
            productNamedCategories[0]

          if (matchedCategory) {
            autoMainCategoryId = getCategoryId(matchedCategory)
            setCategories(productNamedCategories)
            console.log("[business-register] Found matching category:", {
              name: getCategoryName(matchedCategory),
              id: autoMainCategoryId
            })
          } else if (createdCategoryId) {
            autoMainCategoryId = createdCategoryId
            setCategories([
              {
                main_category_id: createdCategoryId,
                main_category_name: productName,
              },
            ])
            console.log("[business-register] Using freshly created product category ID:", createdCategoryId)
          } else {
            setCategories([])
            console.warn("[business-register] Product category was not found in categorieslist")
          }
        } else {
          console.warn("[business-register] No categories returned from API")
          if (createdCategoryId) {
            autoMainCategoryId = createdCategoryId
            setCategories([
              {
                main_category_id: createdCategoryId,
                main_category_name: productName,
              },
            ])
          }
        }
      } catch (err) {
        console.error("[business-register] Categories fetch failed:", err?.message || err)
        if (createdCategoryId) {
          autoMainCategoryId = createdCategoryId
          setCategories([
            {
              main_category_id: createdCategoryId,
              main_category_name: productName,
            },
          ])
        }
      }

      // Fallback to environment variable if still not set
      if (!autoMainCategoryId) {
        autoMainCategoryId = String(DEFAULT_MAIN_CATEGORY_ID || "").trim()
        console.log("[business-register] Using DEFAULT_MAIN_CATEGORY_ID:", autoMainCategoryId)
      }

      console.log("[business-register] Final selected category ID:", autoMainCategoryId)
      setProductCategoryId(String(autoMainCategoryId || "").trim())

      const initialPrimaryNumber = String(
        regDraft?.primaryNumber || verifiedMobile?.mobile_number || ""
      ).trim()
      const initialWhatsappNumber = String(
        regDraft?.whatsappNumber || verifiedWhatsapp?.mobile_number || verifiedMobile?.mobile_number || ""
      ).trim()

      setForm((prev) => ({
        ...prev,
        mainCategoryId: String(autoMainCategoryId || prev.mainCategoryId || "").trim(),
        seanebId: regDraft?.seanebId || prev.seanebId,
        primaryNumber: initialPrimaryNumber || prev.primaryNumber,
        whatsappNumber: initialWhatsappNumber || prev.whatsappNumber,
        businessEmail: initialBusinessEmail || prev.businessEmail,
        pan: verifiedPan || prev.pan,
        gstin: verifiedGstin || prev.gstin,
      }))

      if (existingBranchId) {
        setBranchId(existingBranchId)
      }

      if (verifiedBusinessEmail && verifiedBusinessEmail === initialBusinessEmail) {
        setEmailVerified(true)
      }
      // Always require fresh mobile verification on business registration form.
      setMobileVerified(false)
      setWhatsappVerified(false)
      if (verifiedPan) {
        setPanVerified(true)
      }
      if (verifiedGstin) {
        setGstVerified(true)
      }
      if (verifiedWhatsapp?.mobile_number) {
        setWhatsappVerified(true)
      }

      setMounted(true)
    }

    // Debounce initial session bootstrap on mount to avoid refresh-token rotation conflicts
    // when users spam page refresh.
    if (isSsoCallback()) {
      void init()
    } else {
      timer = window.setTimeout(() => {
        if (active) void init()
      }, 300)
    }

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [applyUserProfile, ensureAuthSessionReady, router])

  useEffect(() => {
    const fromSession = getResolvedCountryCode()
    const countryFromSession = getCountryByCode(fromSession)
    if (countryFromSession) {
      setSelectedCountry(countryFromSession)
    }
  }, [])

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

    if (key === "businessLocation") {
      setForm((prev) => ({ ...prev, placeId: "", cityId: "", latitude: "", longitude: "" }))
    }
    if (key === "businessName") {
      setForm((prev) => ({
        ...prev,
        businessName: safeValue,
        displayName:
          !String(prev.displayName || "").trim() || prev.displayName === prev.businessName
            ? safeValue
            : prev.displayName,
        businessPlaceId: "",
        photoReference: "",
      }))
      return
    }
    if (key === "pan") {
      setPanVerified(false)
      removeCookie("verified_pan")
      setPanStatusText("")
    }
    if (key === "gstin") {
      setGstVerified(false)
      removeCookie("verified_gstin")
      setGstStatusText("")
    }
    if (key === "businessEmail") {
      setEmailVerified(false)
      removeCookie("verified_business_email")
    }
    if (key === "primaryNumber") {
      setMobileVerified(false)
      removeCookie("verified_business_mobile")
      setForm((prev) => ({ ...prev, primaryNumber: safeValue }))
      return
    }
    if (key === "whatsappNumber") {
      setWhatsappVerified(false)
      removeCookie("verified_business_whatsapp")
      setForm((prev) => ({ ...prev, whatsappNumber: safeValue }))
      return
    }
    if (key === "seanebId") {
      setSeanebVerified(false)
    }

    setForm((prev) => ({ ...prev, [key]: safeValue }))
  }

  useEffect(() => {
    const verifiedBusinessEmail = getCookie("verified_business_email")
    if (verifiedBusinessEmail && verifiedBusinessEmail === form.businessEmail.trim()) {
      setEmailVerified(true)
    } else {
      setEmailVerified(false)
    }
  }, [form.businessEmail])

  useEffect(() => {
    const verifiedPan = getCookie("verified_pan")
    if (verifiedPan && verifiedPan === form.pan.trim().toUpperCase()) {
      setPanVerified(true)
    } else if (!form.pan.trim()) {
      setPanVerified(false)
    }
  }, [form.pan])

  useEffect(() => {
    const verifiedGstin = getCookie("verified_gstin")
    if (verifiedGstin && verifiedGstin === form.gstin.trim().toUpperCase()) {
      setGstVerified(true)
    } else if (!form.gstin.trim()) {
      setGstVerified(false)
    }
  }, [form.gstin])

  useEffect(() => {
    const whatsappCookie = getJsonCookie("verified_business_whatsapp")
    const cookieNumber = normalizeMobileNumber(whatsappCookie?.mobile_number)
    const isCookieVerified =
      Boolean(normalizedWhatsappNumber) && normalizedWhatsappNumber === cookieNumber

    if (isCookieVerified) {
      if (!whatsappVerified) {
        setWhatsappVerified(true)
      }
      if (whatsappAutoVerified) {
        setWhatsappAutoVerified(false)
      }
      return
    }

    if (isWhatsappSameAsPrimary) {
      if (!whatsappVerified) {
        setWhatsappVerified(true)
      }
      if (!whatsappAutoVerified) {
        setWhatsappAutoVerified(true)
      }
      return
    }

    if (whatsappAutoVerified) {
      setWhatsappAutoVerified(false)
    }
    if (whatsappVerified) {
      setWhatsappVerified(false)
    }
  }, [
    isWhatsappSameAsPrimary,
    normalizedWhatsappNumber,
    whatsappAutoVerified,
    whatsappVerified,
  ])

  useEffect(() => {
    let active = true
    const query = debouncedBusinessName?.trim()

    if (suppressNextBusinessAutocompleteRef.current) {
      suppressNextBusinessAutocompleteRef.current = false
      return
    }

    if (!query || query.length < 2) {
      setBusinessSuggestions([])
      setBusinessSuggestOpen(false)
      setBusinessSuggestLoading(false)
      return
    }

    const load = async () => {
      try {
        setBusinessSuggestLoading(true)
        const list = await getBusinessAutocomplete(query)
        if (!active) return
        setBusinessSuggestions(Array.isArray(list) ? list : [])
        setBusinessSuggestOpen(true)
      } finally {
        if (active) setBusinessSuggestLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [debouncedBusinessName])

  const handleEmailVerify = async () => {
    const email = form.businessEmail.trim()
    if (!email || emailLoading || emailVerified) return

    try {
      setEmailLoading(true)
      setSubmitError("")
      setOtpError("")

      await sendEmailOtp({ email, purpose: PURPOSE_BUSINESS_EMAIL_VERIFY })

      setJsonCookie(
        "otp_context",
        {
          type: "email",
          email,
          purpose: PURPOSE_BUSINESS_EMAIL_VERIFY,
          redirect_to: "/auth/business-register",
        },
        { maxAge: 60, path: "/" }
      )

      setOtpValue("")
      setOtpClearSignal((value) => value + 1)
      setOtpModalType("email")
      setOtpModalTarget(email)
      setOtpResendCooldown(RESEND_COOLDOWN_SECONDS)
      setOtpModalOpen(true)
    } catch (err) {
      setSubmitError(
        getErrorMessage(err, text("errorSendBusinessEmailOtp", "Failed to send business email OTP"))
      )
    } finally {
      setEmailLoading(false)
    }
  }

  const sendBusinessMobileOtp = async (via = OTP_VIA_SMS) => {
    const mobile = form.primaryNumber.trim()
    const channel = via === OTP_VIA_WHATSAPP ? OTP_VIA_WHATSAPP : OTP_VIA_SMS
    const selectedCountryCode = normalizeCountryCode(selectedCountry?.dialCode)

    if (!mobile || mobileLoading || mobileVerified) return false

    if (!MOBILE_REGEX.test(mobile)) {
      setSubmitError(text("errorVerifyPrimaryNumber", "Enter a valid primary number to verify"))
      return false
    }

    const countryCode = selectedCountryCode || getResolvedCountryCode()

    if (!countryCode) {
      setSubmitError(text("errorSelectCountryCode", "Please select country code."))
      return false
    }

    setCookie("otp_cc", countryCode, { maxAge: 60 * 60 * 24 * 7, path: "/" })
    setJsonCookie(
      "otp_context",
      {
        country_code: countryCode,
        mobile_number: mobile,
        via: channel,
        purpose: PURPOSE_BUSINESS_MOBILE_VERIFY,
        redirect_to: "/auth/business-register",
      },
      { maxAge: 300, path: "/" }
    )

    await sendOtp({ via: channel, disableFallback: true })

    setMobileOtpVia(channel)
    setOtpValue("")
    setOtpClearSignal((value) => value + 1)
    setOtpModalType("mobile")
    setOtpModalTarget(`+${countryCode} ${mobile}`)
    setOtpResendCooldown(RESEND_COOLDOWN_SECONDS)
    setOtpModalOpen(true)
    return true
  }

  const sendBusinessWhatsappOtp = async () => {
    const mobile = form.whatsappNumber.trim()
    const selectedCountryCode = normalizeCountryCode(selectedCountry?.dialCode)

    if (!mobile || whatsappLoading || whatsappVerified || whatsappAutoVerified) return false

    if (!MOBILE_REGEX.test(mobile)) {
      setSubmitError(text("errorVerifyWhatsappNumber", "Enter a valid WhatsApp number to verify"))
      return false
    }

    const countryCode = selectedCountryCode || getResolvedCountryCode()

    if (!countryCode) {
      setSubmitError(text("errorSelectCountryCode", "Please select country code."))
      return false
    }

    setCookie("otp_cc", countryCode, { maxAge: 60 * 60 * 24 * 7, path: "/" })
    setJsonCookie(
      "otp_context",
      {
        country_code: countryCode,
        mobile_number: mobile,
        via: OTP_VIA_WHATSAPP,
        purpose: PURPOSE_BUSINESS_MOBILE_VERIFY,
        redirect_to: "/auth/business-register",
      },
      { maxAge: 300, path: "/" }
    )

    await sendOtp({ via: OTP_VIA_WHATSAPP, disableFallback: true })

    setMobileOtpVia(OTP_VIA_WHATSAPP)
    setOtpValue("")
    setOtpClearSignal((value) => value + 1)
    setOtpModalType("whatsapp")
    setOtpModalTarget(`+${countryCode} ${mobile}`)
    setOtpResendCooldown(RESEND_COOLDOWN_SECONDS)
    setOtpModalOpen(true)
    return true
  }

  const handleMobileVerify = async () => {
    try {
      setMobileLoading(true)
      setSubmitError("")
      await sendBusinessMobileOtp(OTP_VIA_SMS)
    } catch (err) {
      const status = Number(err?.response?.status || 0)
      const code = String(err?.response?.data?.code || err?.response?.data?.error?.code || "").trim().toUpperCase()
      const backendMessage = String(
        err?.response?.data?.error?.message || err?.response?.data?.message || ""
      ).trim()

      // Show only backend messages for throttling/cooldown scenarios.
      if (status === 429 && code === "OTP_ALREADY_SENT" && !backendMessage) {
        setSubmitError("")
      } else {
        setSubmitError(backendMessage)
      }
    } finally {
      setMobileLoading(false)
    }
  }

  const handleWhatsappVerify = async () => {
    try {
      setWhatsappLoading(true)
      setSubmitError("")
      await sendBusinessWhatsappOtp()
    } catch (err) {
      const status = Number(err?.response?.status || 0)
      const code = String(err?.response?.data?.code || err?.response?.data?.error?.code || "").trim().toUpperCase()
      const backendMessage = String(
        err?.response?.data?.error?.message || err?.response?.data?.message || ""
      ).trim()

      if (status === 429 && code === "OTP_ALREADY_SENT" && !backendMessage) {
        setSubmitError("")
      } else {
        setSubmitError(backendMessage)
      }
    } finally {
      setWhatsappLoading(false)
    }
  }

  const closeOtpModal = () => {
    setOtpModalOpen(false)
    setOtpError("")
    setOtpValue("")
  }

  const handleVerifyInlineOtp = async () => {
    if (String(otpValue || "").length !== 4 || otpVerifying) return

    try {
      setOtpVerifying(true)
      setOtpError("")

      if (otpModalType === "email") {
        const email = form.businessEmail.trim()
        await verifyEmailOtp({
          email,
          otp: otpValue,
          purpose: PURPOSE_BUSINESS_EMAIL_VERIFY,
        })
        setCookie("verified_business_email", email, {
          maxAge: 60 * 60 * 24 * 7,
          path: "/",
        })
        setEmailVerified(true)
        setEmailEditCooldown(VERIFIED_EDIT_COOLDOWN_SECONDS)
      } else if (otpModalType === "mobile") {
        await verifyOtpAndLogin({ otp: otpValue })
        const ctx = getJsonCookie("otp_context")
        if (ctx?.mobile_number && ctx?.country_code) {
          setJsonCookie(
            "verified_business_mobile",
            {
              country_code: String(ctx.country_code),
              mobile_number: String(ctx.mobile_number),
            },
            { maxAge: 60 * 60 * 24 * 7, path: "/" }
          )
        }
        setMobileVerified(true)
        setMobileEditCooldown(VERIFIED_EDIT_COOLDOWN_SECONDS)
      } else if (otpModalType === "whatsapp") {
        await verifyOtpAndLogin({ otp: otpValue })
        const ctx = getJsonCookie("otp_context")
        if (ctx?.mobile_number && ctx?.country_code) {
          setJsonCookie(
            "verified_business_whatsapp",
            {
              country_code: String(ctx.country_code),
              mobile_number: String(ctx.mobile_number),
            },
            { maxAge: 60 * 60 * 24 * 7, path: "/" }
          )
        }
        setWhatsappVerified(true)
        setWhatsappEditCooldown(VERIFIED_EDIT_COOLDOWN_SECONDS)
      }

      removeCookie("otp_context")
      closeOtpModal()
    } catch (err) {
      setOtpError(getErrorMessage(err, "Invalid OTP"))
      setOtpValue("")
      setOtpClearSignal((value) => value + 1)
    } finally {
      setOtpVerifying(false)
    }
  }

  const formatCooldown = (seconds) => {
    const safe = Math.max(0, Number(seconds) || 0)
    const mins = String(Math.floor(safe / 60)).padStart(2, "0")
    const secs = String(safe % 60).padStart(2, "0")
    return `${mins}:${secs}`
  }

  const handleEnableMobileEdit = () => {
    if (mobileEditCooldown > 0) return
    setMobileVerified(false)
    removeCookie("verified_business_mobile")
  }

  const handleEnableWhatsappEdit = () => {
    if (whatsappEditCooldown > 0) return
    setWhatsappVerified(false)
    removeCookie("verified_business_whatsapp")
  }

  const handleEnableEmailEdit = () => {
    if (emailEditCooldown > 0) return
    setEmailVerified(false)
    removeCookie("verified_business_email")
  }

  const handleResendInlineOtp = async (channelOverride) => {
    if (otpResending || otpResendCooldown > 0) return

    try {
      setOtpResending(true)
      setOtpError("")

      if (otpModalType === "email") {
        const email = form.businessEmail.trim()
        await sendEmailOtp({ email, purpose: PURPOSE_BUSINESS_EMAIL_VERIFY })
      } else if (otpModalType === "mobile") {
        const channel = channelOverride === OTP_VIA_WHATSAPP ? OTP_VIA_WHATSAPP : OTP_VIA_SMS
        await sendBusinessMobileOtp(channel)
      } else if (otpModalType === "whatsapp") {
        await sendBusinessWhatsappOtp()
      }
      setOtpResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      const status = Number(err?.response?.status || 0)
      const code = String(err?.response?.data?.code || err?.response?.data?.error?.code || "").trim().toUpperCase()
      const backendMessage = String(
        err?.response?.data?.error?.message || err?.response?.data?.message || ""
      ).trim()

      if (status === 429 && code === "OTP_ALREADY_SENT" && !backendMessage) {
        setOtpError("")
      } else {
        setOtpError(backendMessage)
      }
      const backendWait = Number(
        err?.response?.data?.error?.wait_seconds ||
          err?.response?.data?.wait_seconds ||
          err?.response?.data?.waitSeconds ||
          0
      )
      if (backendWait > 0) {
        setOtpResendCooldown(backendWait)
      }
    } finally {
      setOtpResending(false)
    }
  }

  const handleVerifyPan = async () => {
    const pan = form.pan.trim().toUpperCase()

    if (!pan || panVerified || verifyingPan) return
    setPanStatusText("")
    if (!PAN_REGEX.test(pan)) {
      setSubmitError(text("errorInvalidPan", "Invalid PAN number"))
      return
    }
    if (!branchId) {
      setPanStatusText(
        text(
          "panVerificationAfterBranch",
          "PAN verification will be available right after branch creation."
        )
      )
      return
    }
    if (!(await ensureAuthSessionReady())) {
      setSubmitError(text("errorSessionExpired", "Session expired. Please login again."))
      redirectToBusinessRegisterLogin(router)
      return
    }

    try {
      setSubmitError("")
      setVerifyingPan(true)
      await verifyPanForBranch({ pan, branch_id: branchId })
      setPanVerified(true)
      setPanStatusText(text("panVerifiedSuccess", "PAN verified successfully."))
      setCookie("verified_pan", pan, { maxAge: 60 * 60 * 24 * 7, path: "/" })
    } catch (err) {
      setPanVerified(false)
      setPanStatusText(getErrorMessage(err, text("errorPanVerificationFailed", "PAN verification failed")))
    } finally {
      setVerifyingPan(false)
    }
  }

  const handleVerifyGst = async () => {
    const gstin = form.gstin.trim().toUpperCase()

    if (!gstin || gstVerified || verifyingGst) return
    setGstStatusText("")
    if (!GST_REGEX.test(gstin)) {
      setSubmitError(text("errorInvalidGstin", "Invalid GSTIN number"))
      return
    }
    if (!branchId) {
      setGstStatusText(
        text(
          "gstinVerificationAfterBranch",
          "GSTIN verification will be available right after branch creation."
        )
      )
      return
    }
    if (!(await ensureAuthSessionReady())) {
      setSubmitError(text("errorSessionExpired", "Session expired. Please login again."))
      redirectToBusinessRegisterLogin(router)
      return
    }

    try {
      setSubmitError("")
      setVerifyingGst(true)
      await verifyGstForBranch({ gstin, branch_id: branchId })
      setGstVerified(true)
      setGstStatusText(text("gstinVerifiedSuccess", "GSTIN verified successfully."))
      setCookie("verified_gstin", gstin, { maxAge: 60 * 60 * 24 * 7, path: "/" })
    } catch (err) {
      setGstVerified(false)
      setGstStatusText(
        getErrorMessage(err, text("errorGstinVerificationFailed", "GSTIN verification failed"))
      )
    } finally {
      setVerifyingGst(false)
    }
  }

  const launchPaymentAndFinalize = useCallback(async (registrationContext = {}) => {
    const branchId = String(registrationContext?.createdBranchId || "").trim()
    const businessId = String(registrationContext?.businessId || "").trim()
    const orderId = String(registrationContext?.orderId || "").trim()
    const paymentSessionId = String(registrationContext?.paymentSessionId || "").trim()

    if (!paymentSessionId) {
      await reportPaymentFlow({
        event: "payment_session_missing",
        branchId,
        businessId,
        orderId,
        status: BRANCH_PAYMENT_STATUS_FAILED,
        error: "Payment session ID was not generated for the branch.",
      })
      setSubmitError(text("errorPaymentUnavailable", "Payment session is unavailable right now."))
      return false
    }

    setSubmitError("")
    setPaymentNotice("")
    setPaymentLaunching(true)

    try {
      const trackedState = await readTrackedPaymentState({
        branchId,
        orderId,
        sessionId: paymentSessionId,
      })

      if (trackedState.status === BRANCH_PAYMENT_STATUS_ACTIVE) {
        setPendingPaymentContext(null)
        const completed = await completeSuccessfulRegistration(registrationContext)
        if (!completed) {
          setSubmitError(
            text(
              "errorPaymentConfirmationFailed",
              "Payment was received, but branch activation could not be confirmed yet."
            )
          )
        }
        return completed
      }

      if (trackedState.status === BRANCH_PAYMENT_STATUS_FAILED) {
        const trackedError =
          String(trackedState?.tracked?.error || "").trim() ||
          text("errorPaymentFailed", "Payment could not be completed. Please try again.")
        setSubmitError(trackedError)
        return false
      }
    } catch {
      // If the status probe fails, continue to checkout launch and let the standard flow recover.
    }

      await reportPaymentFlow({
        event: "payment_initiated",
        branchId,
        businessId,
        orderId,
        sessionId: paymentSessionId,
        status: BRANCH_PAYMENT_STATUS_PENDING,
      })

    try {
      await startPayment(paymentSessionId)
      setPaymentAwaitingConfirmation(true)
      setPaymentNotice(
        text(
          "paymentProcessingNotice",
          "Cashfree is finalizing your payment. Please keep this page open."
        )
      )

      const profileConfirmed = await confirmRegisteredBusinessProfile({
        expectedBranchId: branchId,
      })
      if (profileConfirmed) {
        setPendingPaymentContext(null)
        setPaymentNotice("")
        const completed = await completeSuccessfulRegistration(registrationContext)
        if (!completed) {
          setSubmitError(
            text(
              "errorPaymentConfirmationFailed",
              "Payment was received, but branch activation could not be confirmed yet."
            )
          )
        }
        return completed
      }

      await waitForTrackedPaymentResolution({
        branchId,
        orderId,
        paymentSessionId,
      })

      setPendingPaymentContext(null)
      setPaymentNotice("")
      const completed = await completeSuccessfulRegistration(registrationContext)
      if (!completed) {
        setSubmitError(
          text(
            "errorPaymentConfirmationFailed",
            "Payment was received, but branch activation could not be confirmed yet."
          )
        )
        return false
      }
      return true
    } catch (err) {
      const paymentErrorCode = String(err?.code || "").trim()
      const paymentError = getErrorMessage(
        err,
        text("errorPaymentFailed", "Payment could not be completed. Please try again.")
      )

      if (paymentErrorCode === "PAYMENT_CONFIRMATION_PENDING") {
        await reportPaymentFlow({
          event: "payment_confirmation_pending",
          branchId,
          businessId,
          orderId,
          sessionId: paymentSessionId,
          status: BRANCH_PAYMENT_STATUS_PENDING,
          error: paymentError,
        })
        setPaymentNotice(paymentError)
        setSubmitError("")
        return false
      }

      await reportPaymentFlow({
        event:
          paymentErrorCode === "PAYMENT_TRACKED_FAILED"
            ? "payment_confirmation_failed"
            : "payment_initiation_failed",
        branchId,
        businessId,
        orderId,
        sessionId: paymentSessionId,
        status: BRANCH_PAYMENT_STATUS_FAILED,
        error: paymentError,
      })
      setPaymentNotice("")
      setSubmitError(paymentError)
      return false
    } finally {
      setPaymentLaunching(false)
      setPaymentAwaitingConfirmation(false)
    }
  }, [
    completeSuccessfulRegistration,
    confirmRegisteredBusinessProfile,
    readTrackedPaymentState,
    reportPaymentFlow,
    startPayment,
    text,
    waitForTrackedPaymentResolution,
  ])

  const handleSubmit = async () => {
    const businessName = normalizeBusinessLabel(form.businessName)
    const displayName = normalizeBusinessLabel(form.displayName)
    const businessType = form.businessType
    const placeId = form.placeId.trim()
    const cityId = form.cityId.trim()
    const primaryNumber = form.primaryNumber.trim()
    const whatsappNumber = form.whatsappNumber.trim()
    const effectiveWhatsappNumber = whatsappNumber || primaryNumber
    const countryCode = normalizeCountryCode(selectedCountry?.dialCode)
    const businessWebsite = form.businessWebsite.trim()
    const businessEmail = form.businessEmail.trim()
    const aboutBranch = form.aboutBranch.trim() || defaultAboutBranch
    const pan = form.pan.trim().toUpperCase()
    const gstin = form.gstin.trim().toUpperCase()
    const businessPlaceId = form.businessPlaceId.trim()
    const photoReference = form.photoReference.trim()
    let latitude = normalizeCoordinate(form.latitude)
    let longitude = normalizeCoordinate(form.longitude)

    if (!businessName) {
      setSubmitError(text("errorBusinessNameRequired", "Business name is required"))
      return
    }
    if (!displayName) {
      setSubmitError(text("errorDisplayNameRequired", "Display name is required"))
      return
    }
    const lockedProductKey = String(lockedProductKeyRef.current || getDefaultProductKey() || "").trim()
    if (lockedProductKey) {
      // Force the same key used by category discovery/creation.
      setDefaultProductKey(lockedProductKey)
    }

    let resolvedMainCategoryId = String(productCategoryId || form.mainCategoryId || "").trim()
    if (!resolvedMainCategoryId) {
      try {
        const productName = getDefaultProductName()
        resolvedMainCategoryId = String(await createMainCategory(productName) || "").trim()
        if (resolvedMainCategoryId) {
          setProductCategoryId(resolvedMainCategoryId)
          setCategories((prev) =>
            prev.length
              ? prev
              : [{ main_category_id: resolvedMainCategoryId, main_category_name: productName }]
          )
        }
      } catch (err) {
        console.warn("[business-register] Submit-time category create failed:", err?.message || err)
      }
    }
    if (resolvedMainCategoryId && resolvedMainCategoryId !== form.mainCategoryId.trim()) {
      setForm((prev) => ({ ...prev, mainCategoryId: resolvedMainCategoryId }))
    }
    if (!resolvedMainCategoryId) {
      setSubmitError(
        text(
          "errorMainCategoryUnavailable",
          "Main category is not available right now. Please retry in a moment."
        )
      )
      return
    }
    if (businessType === "") {
      setSubmitError(text("errorBusinessTypeRequired", "Business type is required"))
      return
    }
    if (!primaryNumber || !MOBILE_REGEX.test(primaryNumber)) {
      setSubmitError(text("errorPrimaryNumberRequired", "Valid primary number is required"))
      return
    }
    if (!mobileVerified) {
      setSubmitError(
        text(
          "errorVerifyBusinessMobile",
          "Please verify business mobile number before registration"
        )
      )
      return
    }
    if (form.seanebId.trim() && !seanebVerified) {
      setSubmitError(text("errorVerifySeaNeB", "Please verify SeaNeB ID before registration"))
      return
    }
    const resolvedPlaceId = placeId || cityId
    if (!resolvedPlaceId) {
      setSubmitError(text("errorBusinessLocationRequired", "Business location is required"))
      return
    }
      if (resolvedPlaceId && !hasMeaningfulCoordinates(latitude, longitude)) {
        const geometry = await fetchPlaceGeometry(resolvedPlaceId, form.businessLocation)
        if (hasMeaningfulCoordinates(geometry.lat, geometry.lng)) {
          latitude = geometry.lat
          longitude = geometry.lng
          setForm((prev) => ({
          ...prev,
          latitude: geometry.lat,
          longitude: geometry.lng,
        }))
      }
    }
    if (!hasMeaningfulCoordinates(latitude, longitude)) {
      setSubmitError(
        text(
          "errorSelectValidLocation",
          "Please select a valid location from autocomplete to capture coordinates"
        )
      )
      return
    }
    if (pan && !PAN_REGEX.test(pan)) {
      setSubmitError(text("errorInvalidPanFormat", "Invalid PAN format"))
      return
    }
    if (gstin && !GST_REGEX.test(gstin)) {
      setSubmitError(text("errorInvalidGstinFormat", "Invalid GSTIN format"))
      return
    }
    if (!form.agree) {
      setSubmitError(text("errorAgreeTerms", "You must agree to the terms and conditions"))
      return
    }

    if (pendingPaymentContext?.paymentSessionId) {
      await launchPaymentAndFinalize(pendingPaymentContext)
      return
    }

    if (!(await ensureAuthSessionReady())) {
      setSubmitError(text("errorSessionExpired", "Session expired. Please login again."))
      redirectToBusinessRegisterLogin(router)
      return
    }

    setSubmitError("")

    const paymentStepError = validateStep(5)
    if (paymentStepError) {
      setSubmitError(paymentStepError)
      return
    }

    await runWithTransition(
      async () => {
        const response = await registerBusiness({
          business_name: businessName,
          display_name: displayName,
          main_category_id: resolvedMainCategoryId,
          business_type: Number(form.businessType),
          seaneb_id: form.seanebId.trim(),
          country_code: countryCode || undefined,
          primary_number: primaryNumber,
          whatsapp_number: effectiveWhatsappNumber,
          business_website: businessWebsite || undefined,
          business_email: businessEmail || undefined,
          about_branch: aboutBranch,
          address: form.businessLocation.trim(),
          landmark: form.landmark.trim(),
          place_id: resolvedPlaceId,
          city_id: cityId || undefined,
          business_place_id: businessPlaceId,
          photo_reference: photoReference,
          latitude,
          longitude,
          pan,
          gstin,
          product_key: lockedProductKey,
        })
        return response
      },
      {
        onSuccess: async (response) => {
          const data = response?.data || response || {}
          const payload = extractPayload(data)
          const businessId = String(payload?.business_id || payload?.id || data?.business_id || data?.id || "").trim()
          const createdBranchId = String(
            payload?.branch_id || payload?.default_branch_id || data?.branch_id || data?.default_branch_id || ""
          ).trim()
          const orderId = extractOrderId(data)
          const paymentSessionId = extractPaymentSessionId(data)

          hydrateRegistrationTokens(response)

          await reportPaymentFlow({
            event: createdBranchId ? "branch_created" : "branch_creation_failed",
            branchId: createdBranchId,
            businessId,
            orderId,
            sessionId: paymentSessionId,
            status: createdBranchId ? BRANCH_PAYMENT_STATUS_PENDING : BRANCH_PAYMENT_STATUS_FAILED,
            error: createdBranchId ? "" : "Business was created without a branch identifier.",
          })

          if (!createdBranchId) {
            setSubmitError(
              text("errorBranchCreationFailed", "Branch could not be created. Please retry registration.")
            )
            return
          }

          const registrationContext = {
            businessId,
            createdBranchId,
            orderId,
            businessName,
            displayName,
            businessType: String(form.businessType),
            businessEmail,
            aboutBranch,
            businessLocation: form.businessLocation.trim(),
            placeId: resolvedPlaceId,
            pan,
            gstin,
          }

          if (paymentSessionId) {
            await reportPaymentFlow({
              event: "payment_session_created",
              branchId: createdBranchId,
              businessId,
              orderId,
              sessionId: paymentSessionId,
              status: BRANCH_PAYMENT_STATUS_PENDING,
            })
            stopTransition()
            setPendingPaymentContext({
              ...registrationContext,
              paymentSessionId,
            })
            await launchPaymentAndFinalize({
              ...registrationContext,
              paymentSessionId,
            })
            return
          }

          await reportPaymentFlow({
            event: "payment_session_missing",
            branchId: createdBranchId,
            businessId,
            orderId,
            status: BRANCH_PAYMENT_STATUS_FAILED,
            error: "Payment session ID missing after branch creation.",
          })
          setSubmitError(text("errorPaymentUnavailable", "Payment session is unavailable right now."))
        },
        onError: (err) => {
          (async () => {
            const status = Number(err?.response?.status || 0)
            const data = err?.response?.data || err?.response || {}
            const payload = extractPayload(data)
            const orderId = extractOrderId(data)
            const initialErrorMessage = getErrorMessage(err, text("errorRegistrationFailed", "Registration failed"))

            const maybeBusinessId =
              payload?.business_id || payload?.id || data?.business_id || data?.id || ""
            const maybeBranchId = String(
              payload?.branch_id || payload?.default_branch_id || data?.branch_id || data?.default_branch_id || ""
            )
            const maybePaymentSessionId = extractPaymentSessionId(data)

            // If auth error but payload contains created business/branch info,
            // treat it as a success fallback instead of forcing login.
            if ((status === 401 || status === 403) && !maybeBusinessId && !maybeBranchId && !maybePaymentSessionId) {
              await reportPaymentFlow({
                event: "order_creation_failed",
                orderId,
                status: BRANCH_PAYMENT_STATUS_FAILED,
                error: initialErrorMessage,
              })
              redirectToBusinessRegisterLogin(router)
              return
            }

            if (maybeBusinessId || maybeBranchId || maybePaymentSessionId) {
              try {
                await reportPaymentFlow({
                  event: maybeBranchId ? "branch_created" : "branch_creation_failed",
                  branchId: maybeBranchId,
                  businessId: maybeBusinessId,
                  orderId,
                  sessionId: maybePaymentSessionId,
                  status: maybeBranchId ? BRANCH_PAYMENT_STATUS_PENDING : BRANCH_PAYMENT_STATUS_FAILED,
                  error: maybeBranchId ? "" : initialErrorMessage,
                })

                if (!maybeBranchId) {
                  setSubmitError(
                    text("errorBranchCreationFailed", "Branch could not be created. Please retry registration.")
                  )
                  return
                }

                const registrationContext = {
                  businessId: maybeBusinessId || "",
                  createdBranchId: maybeBranchId || "",
                  orderId,
                  businessName,
                  displayName,
                  businessType: String(form.businessType),
                  businessEmail,
                  aboutBranch,
                  businessLocation: form.businessLocation.trim(),
                  placeId: resolvedPlaceId,
                  pan,
                  gstin,
                }

                if (maybePaymentSessionId) {
                  hydrateRegistrationTokens(err?.response)
                  await reportPaymentFlow({
                    event: "payment_session_created",
                    branchId: maybeBranchId,
                    businessId: maybeBusinessId,
                    orderId,
                    sessionId: maybePaymentSessionId,
                    status: BRANCH_PAYMENT_STATUS_PENDING,
                  })
                  stopTransition()
                  setPendingPaymentContext({
                    ...registrationContext,
                    paymentSessionId: maybePaymentSessionId,
                  })
                  await launchPaymentAndFinalize({
                    ...registrationContext,
                    paymentSessionId: maybePaymentSessionId,
                  })
                  return
                }

                await reportPaymentFlow({
                  event: "payment_session_missing",
                  branchId: maybeBranchId,
                  businessId: maybeBusinessId,
                  orderId,
                  status: BRANCH_PAYMENT_STATUS_FAILED,
                  error: "Payment session ID missing after fallback branch creation.",
                })
                setSubmitError(text("errorPaymentUnavailable", "Payment session is unavailable right now."))
                return
              } catch (fallbackErr) {
                // If fallback processing fails, fall through to show error below.
                console.warn("[business-register] fallback success handling failed:", fallbackErr)
              }
            }

            await reportPaymentFlow({
              event: "order_creation_failed",
              orderId,
              status: BRANCH_PAYMENT_STATUS_FAILED,
              error: initialErrorMessage,
            })
            setSubmitError(initialErrorMessage)
          })()
        },
      }
    )
  }

  if (!mounted) return null
  if (showTransition) {
    return (
      <AuthTransitionOverlay
        title={text("transitionPreparingTitle", "Preparing registration...")}
        description={text(
          "transitionPreparingDescription",
          "Creating your business profile and preparing secure checkout."
        )}
      />
    )
  }

  return (
    <AuthCard1
      header={<AuthHeader language={language} setLanguage={setLanguage} />}
      maxWidth={980}
      scrollBody={false}
      shellClassName="py-10"
    >
      <div className="business-register-shell">
        <div className="business-register-top">
          <div className="business-register-header">
            <h1 className="business-register-title">{text("title", "Register Your Business")}</h1>
            <p className="business-register-subtitle">
              {text("subtitle", "Set up your branch profile to start listing and managing leads.")}
            </p>
          </div>
          <div className="business-register-progress">
            <div className="business-register-progress-meta">
              <span>
                {textf("stepProgress", "Step {current} of {total}", {
                  current: currentStep,
                  total: wizardSteps.length,
                })}
              </span>
              <strong>{currentStepMeta.title}</strong>
            </div>
            <div className="business-register-progress-track">
              <span style={{ width: `${completionPercent}%` }} />
            </div>
          </div>
          <div className="business-wizard-stepper">
            {wizardSteps.map((step) => {
              const isActive = step.id === currentStep
              const isDone = step.id < currentStep
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`business-wizard-step ${isActive ? "active" : ""} ${isDone ? "done" : ""} min-h-[38px]`}
                  onClick={() => handleStepChange(step.id)}
                  disabled={Boolean(pendingPaymentContext) && step.id !== currentStep}
                >
                  <span className="business-wizard-step-index">{step.id}</span>
                  <span className="business-wizard-step-text whitespace-nowrap">{step.title}</span>
                </button>
              )
            })}
          </div>

        </div>

        {submitError && (
          <div className="business-form-error">
            <p className="business-form-error-text">{submitError}</p>
          </div>
        )}

        <form ref={sectionTopRef} onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="business-form business-form--pro">
          {currentStep === 1 && (
          <section className="business-section-card">
            <div className="business-section-head">
              <h2>{text("sectionBasicsTitle", "Business Basics")}</h2>
              <p>{text("sectionBasicsSubtitle", "Core identity details visible to your customers.")}</p>
            </div>
            <div className="business-grid business-grid--2">
              <Field
                label={text("fieldBusinessName", "Business Name *")}
                hint={text("hintBusinessName", "Type at least 2 letters for name suggestions.")}
              >
                <div className="autocomplete">
                  <input
                    type="text"
                    className="business-form-input"
                    value={form.businessName}
                    maxLength={30}
                    onChange={(e) => setField("businessName", e.target.value)}
                    onFocus={() => {
                      if (form.businessName.trim().length >= 2) setBusinessSuggestOpen(true)
                    }}
                    onBlur={() => {
                      setTimeout(() => setBusinessSuggestOpen(false), 150)
                    }}
                  />

                  {businessSuggestOpen && (
                    <div className="autocomplete-box">
                      {businessSuggestLoading && (
                        <div className="autocomplete-item loading">
                          {text("autocompleteLoading", "Loading...")}
                        </div>
                      )}

                      {!businessSuggestLoading && businessSuggestions.length === 0 && (
                        <div className="autocomplete-item">
                          {text("autocompleteNoBusinesses", "No businesses found")}
                        </div>
                      )}

                      {!businessSuggestLoading &&
                        businessSuggestions.map((item, index) => {
                          const label = getBusinessSuggestionLabel(item)
                          const businessPlaceId = getBusinessSuggestionPlaceId(item)
                          const photoReference = getBusinessSuggestionPhotoReference(item)
                          const thumbnailSrc = buildBusinessPhotoUrl(photoReference, 80)
                          if (!label) return null

                          return (
                            <div
                              key={businessPlaceId || `${label}-${index}`}
                              className="autocomplete-item autocomplete-item--media"
                              onMouseDown={() => {
                                const normalizedLabel = normalizeBusinessLabel(label)
                                suppressNextBusinessAutocompleteRef.current = true
                                setForm((prev) => ({
                                  ...prev,
                                  businessName: normalizedLabel,
                                  displayName:
                                    !String(prev.displayName || "").trim() || prev.displayName === prev.businessName
                                      ? normalizedLabel
                                      : prev.displayName,
                                  businessPlaceId,
                                  photoReference,
                                }))
                                setBusinessSuggestOpen(false)
                              }}
                            >
                              <span className="autocomplete-item__thumb" aria-hidden="true">
                                <Image
                                  src={thumbnailSrc}
                                  alt={text("selectedBusinessPreviewAlt", "Selected business preview")}
                                  width={48}
                                  height={48}
                                  className="autocomplete-item__thumb-img"
                                  unoptimized
                                />
                              </span>
                              <span className="autocomplete-item__label">{label}</span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
                {hasSelectedBusiness && (
                  <div className="business-photo-preview">
                    <Image
                      src={selectedBusinessPhotoSrc}
                      alt={text("selectedBusinessPreviewAlt", "Selected business preview")}
                      width={180}
                      height={180}
                      className="business-photo-preview__img"
                      unoptimized
                    />
                  </div>
                )}
              </Field>

              <Field label={text("fieldDisplayName", "Display Name *")}>
                <input type="text" className="business-form-input" value={form.displayName} onChange={(e) => setField("displayName", e.target.value)} />
              </Field>

              <Field label={text("fieldCategory", "Category *")}>
                <select className="business-form-select" value={form.mainCategoryId} onChange={(e) => setField("mainCategoryId", e.target.value)}>
                  <option value="">{text("optionSelectCategory", "Select a category")}</option>
                  {categories.length > 0 ? (
                    categories.map((category, index) => {
                      const categoryId = getCategoryId(category)
                      const categoryName = getCategoryName(category) || "Unnamed"
                      if (!categoryId) return null
                      return (
                        <option key={categoryId || index} value={categoryId}>
                          {categoryName}
                        </option>
                      )
                    })
                  ) : (
                    <option value="">{text("optionNoCategoriesAvailable", "No categories available")}</option>
                  )}
                </select>
              </Field>

              <Field label={text("fieldBusinessType", "Business Type *")}>
                <select className="business-form-select" value={form.businessType} onChange={(e) => setField("businessType", e)}>
                  <option value="">{text("optionSelectBusinessType", "Select business type")}</option>
                  <option value="0">{text("businessTypeIndividualAgent", "Individual Agent")}</option>
                  <option value="1">{text("businessTypeRealEstateAgency", "Real Estate Agency")}</option>
                  <option value="2">{text("businessTypeDeveloper", "Developer")}</option>
                  <option value="3">{text("businessTypeBrokerFirm", "Broker Firm")}</option>
                </select>
              </Field>

              <div className="md:col-span-2">
                <SeanebIdField
                  value={form.seanebId}
                  onChange={(v) => setField("seanebId", v)}
                  verified={seanebVerified}
                  setVerified={setSeanebVerified}
                  labels={{
                    label: text("fieldSeanebId", "SeaNeB ID *"),
                    placeholder: text("placeholderSeanebId", "username01"),
                    verify: text("buttonVerify", "Verify"),
                    edit: text("buttonEdit", "Edit"),
                    checking: text("buttonChecking", "Checking..."),
                    hint: text(
                      "hintSeanebId",
                      "6-30 characters. Lowercase letters, numbers, and hyphen (-) only."
                    ),
                    existsError: text("errorSeanebIdExists", "SeaNeB ID already exists"),
                    invalidError: text("errorInvalidSeanebId", "Invalid SeaNeB ID"),
                    unavailableError: text("errorSeanebIdUnavailable", "Unable to verify SeaNeB ID"),
                  }}
                />
              </div>
            </div>
          </section>
          )}

          {currentStep === 2 && (
          <section className="business-section-card business-section-card--contact">
            <div className="business-section-head">
              <h2>{text("sectionContactTitle", "Contact Information")}</h2>
              <p>{text("sectionContactSubtitle", "How can customers reach you?")}</p>
            </div>
            <div className="business-contact-grid">
              <Field
                label={text("fieldBusinessEmailOptional", "Business Email (Optional)")}
                hint={text("hintBusinessEmailOptional", "Optional. You can verify it now or later.")}
                className="business-contact-grid-email"
              >
                <div className="business-inline-action business-inline-action--soft">
                  <input
                    type="email"
                    className={`business-form-input ${emailVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={form.businessEmail}
                    disabled={emailVerified}
                    onChange={(e) => setField("businessEmail", e.target.value)}
                    placeholder={text("placeholderBusinessEmail", "Enter business email")}
                  />
                  <button
                    type="button"
                    onClick={emailVerified ? handleEnableEmailEdit : handleEmailVerify}
                    disabled={emailLoading || (!emailVerified && !form.businessEmail.trim()) || (emailVerified && emailEditCooldown > 0)}
                    className="business-inline-action-btn"
                  >
                    {emailLoading
                      ? text("buttonSending", "Sending...")
                      : emailVerified
                        ? text("buttonEdit", "Edit")
                        : text("buttonVerify", "Verify")}
                  </button>
                </div>
                {emailVerified && emailEditCooldown > 0 && (
                  <p className="business-verify-note">
                    {textf("noteTryEditIn", "Try to edit in {time}", {
                      time: formatCooldown(emailEditCooldown),
                    })}
                  </p>
                )}
              </Field>

              <Field
                label={text("fieldPrimaryMobile", "Primary Mobile Number *")}
                className="business-contact-grid-primary"
              >
                <div className="business-phone-row">
                  <CountryCodePicker
                    value={selectedCountry}
                    options={COUNTRY_OPTIONS}
                    onChange={setSelectedCountry}
                    labels={{
                      searchPlaceholder: text("countrySearchPlaceholder", "Search country or code"),
                      noResults: text("countryNoResults", "No country found."),
                    }}
                  />
                  <div className="business-phone-input-wrap">
                    <input
                      type="text"
                      className={`business-form-input ${mobileVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                      value={form.primaryNumber}
                      disabled={mobileVerified}
                      onChange={(e) => setField("primaryNumber", e.target.value.replace(/\D/g, ""))}
                      placeholder={text("placeholderPrimaryNumber", "Enter mobile number")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={mobileVerified ? handleEnableMobileEdit : handleMobileVerify}
                    disabled={mobileLoading || (!mobileVerified && !form.primaryNumber.trim()) || (mobileVerified && mobileEditCooldown > 0)}
                    className="business-inline-action-btn"
                  >
                    {mobileLoading
                      ? text("buttonSending", "Sending...")
                      : mobileVerified
                        ? text("buttonEdit", "Edit")
                        : text("buttonVerify", "Verify")}
                  </button>
                </div>
                {!mobileVerified && (
                  <p className="business-verify-note">
                    {text("noteOtpSentToThisNumber", "OTP will be sent to this number.")}
                  </p>
                )}
                {mobileVerified && mobileEditCooldown > 0 && (
                  <p className="business-verify-note">
                    {textf("noteTryEditIn", "Try to edit in {time}", {
                      time: formatCooldown(mobileEditCooldown),
                    })}
                  </p>
                )}
              </Field>

              <Field
                label={text("fieldWhatsappNumber", "WhatsApp Number")}
                hint={text("hintWhatsappOptional", "Optional. Leave blank to use the primary number.")}
                className="business-contact-grid-whatsapp"
              >
                <div className="business-phone-row">
                  <CountryCodePicker
                    value={selectedCountry}
                    options={COUNTRY_OPTIONS}
                    onChange={setSelectedCountry}
                    labels={{
                      searchPlaceholder: text("countrySearchPlaceholder", "Search country or code"),
                      noResults: text("countryNoResults", "No country found."),
                    }}
                  />
                  <div className="business-phone-input-wrap">
                    <input
                      type="text"
                      className={`business-form-input ${whatsappIsVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                      value={form.whatsappNumber}
                      disabled={whatsappIsVerified && !whatsappAutoVerified}
                      onChange={(e) => setField("whatsappNumber", e.target.value.replace(/\D/g, ""))}
                      placeholder={text("placeholderWhatsappNumber", "Enter WhatsApp number")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={
                      whatsappAutoVerified
                        ? undefined
                        : whatsappIsVerified
                          ? handleEnableWhatsappEdit
                          : handleWhatsappVerify
                    }
                    disabled={
                      whatsappLoading ||
                      whatsappAutoVerified ||
                      (!whatsappIsVerified && !form.whatsappNumber.trim()) ||
                      (!whatsappAutoVerified && whatsappIsVerified && whatsappEditCooldown > 0)
                    }
                    className="business-inline-action-btn"
                  >
                    {whatsappLoading
                      ? text("buttonSending", "Sending...")
                      : whatsappIsVerified
                        ? whatsappAutoVerified
                          ? text("buttonVerified", "Verified")
                          : text("buttonEdit", "Edit")
                        : text("buttonVerify", "Verify")}
                  </button>
                </div>
                {!whatsappIsVerified && form.whatsappNumber.trim() && (
                  <p className="business-verify-note">
                    {text("noteWhatsappOtpSent", "OTP will be sent on WhatsApp to this number.")}
                  </p>
                )}
                {whatsappAutoVerified && (
                  <p className="business-verify-note">
                    {text(
                      "noteWhatsappSameAsPrimary",
                      "Using the same number as primary. WhatsApp verification not required."
                    )}
                  </p>
                )}
                {whatsappIsVerified && !whatsappAutoVerified && whatsappEditCooldown > 0 && (
                  <p className="business-verify-note">
                    {textf("noteTryEditIn", "Try to edit in {time}", {
                      time: formatCooldown(whatsappEditCooldown),
                    })}
                  </p>
                )}
              </Field>

              <Field
                label={text("fieldBusinessWebsiteOptional", "Business Website (Optional)")}
                hint={text("hintBusinessWebsiteOptional", "Optional. Add your website URL if you have one.")}
                className="business-contact-grid-website"
              >
                <input
                  type="url"
                  className="business-form-input"
                  value={form.businessWebsite}
                  onChange={(e) => setField("businessWebsite", e.target.value)}
                  placeholder={text("placeholderBusinessWebsite", "https://yourbusiness.com")}
                />
              </Field>
            </div>
          </section>
          )}

          {currentStep === 3 && (
          <section className="business-section-card">
            <div className="business-section-head">
              <h2>{text("sectionAddressTitle", "Branch Address")}</h2>
              <p>
                {text(
                  "sectionAddressSubtitle",
                  "Add accurate location details so listings and local discovery work correctly."
                )}
              </p>
            </div>
            <div className="business-grid business-grid--2">
              <Field label={text("fieldAboutBranch", "About Branch *")}>
                <input type="text" className="business-form-input" value={form.aboutBranch} onChange={(e) => setField("aboutBranch", e.target.value)} />
              </Field>

              <Field label={text("fieldLandmark", "Landmark")}>
                <input type="text" className="business-form-input" value={form.landmark} onChange={(e) => setField("landmark", e.target.value)} />
              </Field>

              <Field
                label={text("fieldBusinessLocation", "Business Location *")}
                hint={text("hintBusinessLocation", "Select a valid location from autocomplete results.")}
              >
                <AutoComplete
                  value={form.businessLocation}
                  onChange={(v) => setField("businessLocation", v)}
                  placeholder={text("placeholderBusinessLocation", "Search location")}
                  loadingText={text("autocompleteLoading", "Loading...")}
                  noResultsText={text("autocompleteNoLocations", "No cities found")}
                  onSelect={async (city) => {
                    const nextPlaceId = String(city?.place_id || "").trim();
                    const nextCityId = String(city?.city_id || "").trim();
                    const nextLatitude = city?.latitude ?? city?.lat ?? city?.location?.lat ?? "";
                    const nextLongitude = city?.longitude ?? city?.lng ?? city?.location?.lng ?? "";
                    const resolvedPlaceId = nextPlaceId || nextCityId || "";
                    const normalizedLatitude = normalizeCoordinate(nextLatitude);
                    const normalizedLongitude = normalizeCoordinate(nextLongitude);
                    locationLookupRef.current = resolvedPlaceId;
                    setForm((prev) => ({
                      ...prev,
                      placeId: resolvedPlaceId,
                      cityId: nextCityId || nextPlaceId || "",
                      latitude: normalizedLatitude,
                      longitude: normalizedLongitude,
                    }));

                    if (resolvedPlaceId && !hasMeaningfulCoordinates(normalizedLatitude, normalizedLongitude)) {
                      const geometry = await fetchPlaceGeometry(resolvedPlaceId, city?.label || form.businessLocation)
                      if (locationLookupRef.current !== resolvedPlaceId) return
                      if (geometry.lat !== "" || geometry.lng !== "") {
                        setForm((prev) => ({
                          ...prev,
                          latitude: geometry.lat,
                          longitude: geometry.lng,
                        }))
                      }
                    }
                  }}
                />
              </Field>
            </div>
          </section>
          )}

          {currentStep === 4 && (
          <section className="business-section-card">
            <div className="business-section-head">
              <h2>{text("sectionComplianceTitle", "Compliance (Optional)")}</h2>
              <p>
                {text(
                  "sectionComplianceSubtitle",
                  "You can verify PAN and GST now or later from your dashboard."
                )}
              </p>
            </div>
            <div className="business-grid business-grid--2">
              <Field label={text("fieldPanOptional", "PAN (optional)")}>
                <div className="business-inline-action">
                  <input
                    type="text"
                    className={`business-form-input ${panVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={form.pan}
                    maxLength={10}
                    disabled={panVerified}
                    onChange={(e) => setField("pan", e.target.value.toUpperCase())}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyPan}
                    disabled={!form.pan.trim() || panVerified || verifyingPan}
                    className="h-11 min-w-[110px] rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {verifyingPan
                      ? text("buttonVerifying", "Verifying...")
                      : panVerified
                        ? text("buttonVerified", "Verified")
                        : text("buttonVerify", "Verify")}
                  </button>
                </div>
                {panStatusText && <p className="business-verify-note">{panStatusText}</p>}
              </Field>

              <Field label={text("fieldGstinOptional", "GSTIN (optional)")}>
                <div className="business-inline-action">
                  <input
                    type="text"
                    className={`business-form-input ${gstVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={form.gstin}
                    maxLength={15}
                    disabled={gstVerified}
                    onChange={(e) => setField("gstin", e.target.value.toUpperCase())}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyGst}
                    disabled={!form.gstin.trim() || gstVerified || verifyingGst}
                    className="h-11 min-w-[110px] rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {verifyingGst
                      ? text("buttonVerifying", "Verifying...")
                      : gstVerified
                        ? text("buttonVerified", "Verified")
                        : text("buttonVerify", "Verify")}
                  </button>
                </div>
                {gstStatusText && <p className="business-verify-note">{gstStatusText}</p>}
              </Field>
            </div>
          </section>
          )}

          {currentStep === 4 && (
            <div className="business-submit-panel">
              <div className="checkbox-row">
                <input type="checkbox" id="agree" checked={form.agree} onChange={(e) => setField("agree", e.target.checked)} />
                <label htmlFor="agree" className="text-sm cursor-pointer">
                  {text("agreePrefix", "I agree to the business")}{" "}
                  <button
                    type="button"
                    onClick={() => setTermsModalOpen(true)}
                    className="text-blue-600 underline"
                  >
                    {text("agreeTermsLink", "terms and conditions")}
                  </button>
                </label>
              </div>
            </div>
          )}

          {currentStep === 5 && (
          <section className="business-section-card business-section-card--payment">
            <div className="business-section-head">
              <h2>{text("sectionPaymentTitle", "Payment Review")}</h2>
              <p>
                {text(
                  "sectionPaymentSubtitle",
                  "Review the onboarding charge and complete registration with Cashfree."
                )}
              </p>
            </div>

            {pendingPaymentContext && (
              <div className="business-payment-banner">
                {text(
                  "paymentBannerExistingBusiness",
                  "Your business is already created. Complete the onboarding payment to finish registration."
                )}
              </div>
            )}

            {paymentNotice ? (
              <div className="business-payment-loading business-payment-loading--info">
                {paymentNotice}
              </div>
            ) : null}

            {loadingOnboardingCharge ? (
              <div className="business-payment-loading">
                {text("paymentLoading", "Loading onboarding charge preview...")}
              </div>
            ) : onboardingChargePreview ? (
              <div className="business-payment-grid">
                <div className="business-payment-card">
                  <span className="business-payment-card-label">
                    {text("paymentSummaryTitle", "Registration Summary")}
                  </span>
                  <div className="business-payment-summary-list">
                    <div className="business-payment-summary-row">
                      <span>{text("paymentSummaryBusinessName", "Business name")}</span>
                      <strong>{form.businessName || "-"}</strong>
                    </div>
                    <div className="business-payment-summary-row">
                      <span>{text("paymentSummaryDisplayName", "Display name")}</span>
                      <strong>{form.displayName || "-"}</strong>
                    </div>
                    <div className="business-payment-summary-row">
                      <span>{text("paymentSummaryPrimaryNumber", "Primary number")}</span>
                      <strong>{form.primaryNumber || "-"}</strong>
                    </div>
                    <div className="business-payment-summary-row">
                      <span>{text("paymentSummaryLocation", "Location")}</span>
                      <strong>{form.businessLocation || "-"}</strong>
                    </div>
                  </div>
                </div>

                <div className="business-payment-card business-payment-card--charge">
                  <div className="business-payment-charge-head">
                    <span className="business-payment-card-label">
                      {text("paymentChargesTitle", "Onboarding Charges")}
                    </span>
                    <span className="business-payment-provider">{text("paymentProvider", "Cashfree")}</span>
                  </div>
                  <h3>{onboardingChargePreview.description || text("paymentChargesTitle", "Onboarding Charges")}</h3>
                  <div className="business-payment-summary-list">
                    <div className="business-payment-summary-row">
                      <span>{text("paymentBaseAmount", "Base amount")}</span>
                      <strong>{formatInr(onboardingBaseAmount)}</strong>
                    </div>
                    <div className="business-payment-summary-row">
                      <span>
                        {textf("paymentGst", "GST ({percentage}%)", {
                          percentage: onboardingGstPercentage,
                        })}
                      </span>
                      <strong>{formatInr(onboardingGstAmount)}</strong>
                    </div>
                    <div className="business-payment-summary-row business-payment-summary-row--total">
                      <span>{text("paymentTotal", "Total payable")}</span>
                      <strong>{formatInr(onboardingTotalAmount)}</strong>
                    </div>
                  </div>
                  <p className="business-payment-note">
                    {text("paymentNote", "A secure Cashfree modal will open when you continue.")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="business-payment-loading business-payment-loading--error">
                {text("paymentLoadError", "Unable to load onboarding charges right now. Please try again.")}
              </div>
            )}
          </section>
          )}

          <div className="business-wizard-nav pt-1">
            <button
              type="button"
              className="business-wizard-btn business-wizard-btn--ghost inline-flex items-center justify-center"
              onClick={goPreviousStep}
              disabled={currentStep === 1 || Boolean(pendingPaymentContext) || paymentAwaitingConfirmation}
            >
              {text("navPrevious", "Previous")}
            </button>
            {currentStep < wizardSteps.length ? (
              <button
                type="button"
                className="business-wizard-btn business-wizard-btn--primary inline-flex items-center justify-center"
                onClick={goNextStep}
                disabled={Boolean(pendingPaymentContext) || paymentAwaitingConfirmation}
              >
                {text("navNext", "Next")}
              </button>
            ) : (
              <Button
                type="submit"
                label={
                  isTransitioning
                    ? text("loading", "Registering...")
                    : paymentLaunching
                      ? text("actionOpeningPayment", "Opening payment...")
                      : paymentAwaitingConfirmation
                        ? text("actionWaitingPayment", "Waiting for payment...")
                      : pendingPaymentContext
                        ? text("actionContinuePayment", "Continue payment")
                        : text("actionPayNowRegister", "Pay now and register")
                }
                disabled={
                  isTransitioning ||
                  paymentLaunching ||
                  paymentAwaitingConfirmation ||
                  !isPaymentStepReady
                }
                className="max-w-[240px]"
              />
            )}
          </div>
        </form>
      </div>

      <OtpVerificationModal
        open={otpModalOpen}
        title={
          otpModalType === "email"
            ? text("otpTitleEmail", "Verify Business Email")
            : otpModalType === "whatsapp"
              ? text("otpTitleWhatsapp", "Verify WhatsApp Number")
              : text("otpTitleMobile", "Verify Business Mobile")
        }
        subtitle={
          otpModalType === "email"
            ? text("otpSubtitleEmail", "Enter the 4-digit OTP sent to")
            : otpModalType === "whatsapp"
              ? text("otpSubtitleWhatsapp", "Enter the 4-digit OTP sent by WhatsApp")
              : textf("otpSubtitleMobile", "Enter the 4-digit OTP sent by {channel}", {
                  channel: getOtpChannelLabel(mobileOtpVia, {
                    sms: text("otpChannelSms", "SMS"),
                    whatsapp: text("otpChannelWhatsapp", "WhatsApp"),
                  }),
                })
        }
        targetLabel={otpModalTarget}
        helperText={
          otpModalType === "mobile"
            ? mobileOtpVia === OTP_VIA_SMS
              ? text(
                  "otpHelperSms",
                  "If the SMS does not arrive, wait for the timer to finish and resend the OTP on WhatsApp."
                )
              : text(
                  "otpHelperWhatsappSamePrimary",
                  "We sent the OTP on WhatsApp to the same primary number."
                )
            : otpModalType === "whatsapp"
              ? text("otpHelperWhatsappNumber", "We sent the OTP on WhatsApp to the number above.")
            : text("otpHelperEmail", "Use the code from your inbox to complete verification.")
        }
        otp={otpValue}
        onOtpChange={setOtpValue}
        onClose={closeOtpModal}
        onVerify={handleVerifyInlineOtp}
        onResend={() => handleResendInlineOtp(otpModalType === "mobile" ? OTP_VIA_SMS : undefined)}
        resendLabel={
          otpModalType === "mobile"
            ? text("otpResendSms", "Resend by SMS")
            : text("otpResendOtp", "Resend OTP")
        }
        onSecondaryResend={
          otpModalType === "mobile" ? () => handleResendInlineOtp(OTP_VIA_WHATSAPP) : undefined
        }
        secondaryResendLabel={
          otpModalType === "mobile"
            ? text("otpResendWhatsapp", "Resend on WhatsApp")
            : ""
        }
        loading={otpVerifying}
        resending={otpResending}
        cooldown={otpResendCooldown}
        error={otpError}
        clearSignal={otpClearSignal}
        labels={{
          badge: text("otpBadgeLabel", "Secure verification"),
          close: text("otpClose", "Close"),
          instruction: text(
            "otpEnterCodeHint",
            "Enter the 4-digit code. You can paste the full OTP into the first box."
          ),
          verify: text("otpVerifyButton", "Verify OTP"),
          verifying: text("otpVerifyingButton", "Verifying..."),
          sending: text("buttonSending", "Sending..."),
          resendAvailableIn: text("otpResendAvailableIn", "Resend available in {seconds}s"),
        }}
      />
      <TermsConditionsModal
        open={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        textPath={TERMS_TEXT_PATH}
      />
    </AuthCard1>
  )
}

function Field({ label, hint, error, children, className = "" }) {
  return (
    <div className={`business-form-group ${className}`.trim()}>
      <label className="business-form-label">{label}</label>
      {children}
      {hint && !error && <p className="business-form-hint">{hint}</p>}
      {error && <p className="business-form-error-inline">{error}</p>}
    </div>
  )
}

function CountryCodePicker({ value, options, onChange, labels = {} }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef(null)
  const normalizedQuery = query.trim().toLowerCase()
  const searchPlaceholder = labels.searchPlaceholder || "Search country or code"
  const noResults = labels.noResults || "No country found."

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [open])

  const visibleOptions = normalizedQuery
    ? options.filter((country) => {
        const name = String(country?.name || "").toLowerCase()
        const dialCode = String(country?.dialCode || "").toLowerCase()
        return name.includes(normalizedQuery) || dialCode.includes(normalizedQuery)
      })
    : options

  const current = value || DEFAULT_COUNTRY

  return (
    <div className="business-phone-code business-country-picker" ref={rootRef}>
      <button
        type="button"
        className={`business-country-trigger ${open ? "business-country-trigger--open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CountryFlag country={current} />
        <span className="business-country-trigger__code">{current?.dialCode || ""}</span>
        <span className="business-country-trigger__chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="business-country-menu">
          <div className="business-country-search-wrap">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="business-country-search"
              placeholder={searchPlaceholder}
              autoFocus
            />
          </div>
          <div className="business-country-list" role="listbox">
            {visibleOptions.map((country) => {
              const isActive = country.dialCode === current?.dialCode && country.name === current?.name
              return (
                <button
                  key={`${country.name}-${country.dialCode}`}
                  type="button"
                  className={`business-country-option ${isActive ? "business-country-option--active" : ""}`}
                  onClick={() => {
                    onChange(country)
                    setOpen(false)
                    setQuery("")
                  }}
                >
                  <CountryFlag country={country} />
                  <span className="business-country-option__name">{country.name}</span>
                  <span className="business-country-option__code">{country.dialCode}</span>
                </button>
              )
            })}
            {!visibleOptions.length && (
              <div className="business-country-empty">{noResults}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CountryFlag({ country }) {
  const flag = String(country?.flag || "").trim()
  const name = String(country?.name || "Country").trim()

  return (
    <span className="business-country-flag" aria-hidden="true">
      {flag ? (
        <Image
          src={flag}
          alt={`${name} flag`}
          width={22}
          height={22}
          className="business-country-flag__img"
          unoptimized
        />
      ) : (
        <span>{name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  )
}

