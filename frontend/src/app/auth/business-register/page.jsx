"use client"

import { useState, useEffect, useRef } from "react"
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
  verifyPanForBranch,
  verifyGstForBranch,
  getBusinessAutocomplete,
} from "@/app/auth/auth-service/business.service"
import { sendEmailOtp, verifyEmailOtp } from "@/app/auth/auth-service/email.service"
import { sendOtp } from "@/app/auth/auth-service/otp.service"
import { verifyOtpAndLogin, waitForAuthCookies } from "@/app/auth/auth-service/authservice"
import { ensureSessionReady } from "@/app/auth/auth-service/auth.bootstrap"
import { hydrateAuthSession, refreshAccessToken } from "@/lib/api/client"
import { getAccessToken, getCsrfToken } from "@/lib/auth/tokenStorage"
import { getSessionHint } from "@/lib/auth/sessionHint"
import { clearRefreshBudget } from "@/lib/auth/refreshBudget"
import { API_BASE_URL } from "@/lib/core/apiBaseUrl"
import { acquireRefreshLock, releaseRefreshLock } from "@/lib/auth/refreshLock"
import { createMainCategory, getAllActiveCategories } from "@/app/auth/auth-service/category.service"
import { getDefaultProductName, getDefaultProductKey, setDefaultProductKey } from "@/services/dashboard.service"
import { setDashboardMode, DASHBOARD_MODE_BUSINESS } from "@/services/dashboard.service"
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
import { getAllowedReturnOrigins, getPrimaryListingOrigin } from "@/lib/core/postLoginRedirect"

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
const DEFAULT_MAIN_CATEGORY_ID = process.env.NEXT_PUBLIC_MAIN_CATEGORY_ID || ""
const OTP_VIA_WHATSAPP = "whatsapp"
const OTP_VIA_SMS = "sms"
const RESEND_COOLDOWN_SECONDS = 60
const VERIFIED_EDIT_COOLDOWN_SECONDS = 60
const TERMS_TEXT_PATH = "/legal/terms-conditions-property.txt"
const LANGUAGE_STORAGE_KEY = "auth_language"
const AUTH_DEBUG =
  String(process.env.NEXT_PUBLIC_AUTH_DEBUG || "").trim().toLowerCase() === "true"

const logAuthDebug = (...args) => {
  if (!AUTH_DEBUG || typeof console === "undefined") return
  console.debug(...args)
}

const buildCsrfHeaders = (token) => {
  const csrfToken = String(token || "").trim()
  return {
    "x-csrf-token": csrfToken,
    "x-xsrf-token": csrfToken,
    "csrf-token": csrfToken,
  }
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
  aboutBranch: "Head office branch",
  businessLocation: "",
  placeId: "",
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
  String(item?.place_id || item?.id || "").trim()

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

const WIZARD_STEPS = [
  { id: 1, title: "Basic Info" },
  { id: 2, title: "Contact" },
  { id: 3, title: "Location & Compliance" },
]

const getOtpChannelLabel = (via) => (via === OTP_VIA_SMS ? "SMS" : "WhatsApp")

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
  router.replace("/auth/login")
}

export default function BusinessRegisterPage() {
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
  const [form, setForm] = useState(EMPTY_FORM)
  const [mounted, setMounted] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const { isTransitioning, showTransition, runWithTransition } = useAuthSubmitTransition()
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
  const sectionTopRef = useRef(null)
  const lockedProductKeyRef = useRef("")
  const suppressNextBusinessAutocompleteRef = useRef(false)
  const debouncedBusinessName = useDebounce(form.businessName, 300)

  const t = LANG_MAP[language]
  const currentStepMeta = WIZARD_STEPS.find((step) => step.id === currentStep) || WIZARD_STEPS[0]
  const completionPercent = Math.round((currentStep / WIZARD_STEPS.length) * 100)
  const isStepThreeReady =
    form.businessLocation.trim().length > 0 &&
    form.placeId.trim().length > 0 &&
    form.agree
  const normalizedPrimaryNumber = normalizeMobileNumber(form.primaryNumber)
  const normalizedWhatsappNumber = normalizeMobileNumber(form.whatsappNumber)
  const isWhatsappSameAsPrimary =
    Boolean(normalizedPrimaryNumber) &&
    Boolean(normalizedWhatsappNumber) &&
    normalizedPrimaryNumber === normalizedWhatsappNumber
  const whatsappIsVerified = whatsappVerified || whatsappAutoVerified

  const validateStep = (step) => {
    if (step === 1) {
      if (!form.businessName.trim()) return "Enter business name to continue"
      if (!form.displayName.trim()) return "Enter display name to continue"
      if (!form.businessType) return "Select business type to continue"
      if (!form.seanebId.trim()) return "Enter SeaNeB ID to continue"
      return ""
    }

    if (step === 2) {
      if (!form.primaryNumber.trim()) return "Enter primary number to continue"
      if (!MOBILE_REGEX.test(form.primaryNumber.trim())) return "Enter a valid primary number to continue"
      if (form.businessEmail.trim() && !EMAIL_REGEX.test(form.businessEmail.trim())) {
        return "Enter a valid business email or keep it empty"
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
    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length))
  }
  const goPreviousStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1))
  const handleStepChange = (stepId) => {
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
  }, [])

  useEffect(() => {
    const init = async () => {
      const profileCompleted = getCookie("profile_completed")
      const hasSession = await ensureAuthSessionReady()
      const forceRegister =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("force") === "1"

      if (!hasSession) {
        // Allow business registration page to be accessed by guests.
        // Continue initialization without forcing login redirect.
        console.info("[business-register] no session detected; continuing as guest")
      } else {
        if (profileCompleted !== "true") {
          setCookie("profile_completed", "true", {
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
          })
        }
      }

      // If business was already registered earlier, do not show registration again.
      const hasBusinessCookie = getCookie("business_registered") === "true"
      const existingBranchId = String(getCookie("branch_id") || "").trim()
      if ((hasBusinessCookie || existingBranchId) && !forceRegister) {
        router.replace("/dashboard/broker")
        return
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

    init()
  }, [router])

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
      setForm((prev) => ({ ...prev, placeId: "" }))
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

  const hasAccessToken = () => Boolean(String(getAccessToken() || "").trim())

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

  const ensureAuthSessionReady = async () => {
    const ready = await ensureSessionReady({ force: true })
    if (ready && !hasAccessToken()) {
      await tryRefreshAccessToken()
    }

    if (ready) return true

    try {
      const waitResult = await waitForAuthCookies()
      if (waitResult?.ok) {
        const retried = await ensureSessionReady({ force: true })
        if (retried && !hasAccessToken()) {
          await tryRefreshAccessToken()
        }
        return retried
      }
    } catch {
      // ignore cookie wait failures
    }

    try {
      const hint = await getSessionHint({ force: true })
      if (hint?.hasRefreshSession || hint?.hasCsrfCookie) {
        await tryRefreshAccessToken()
        const retried = await ensureSessionReady({ force: true })
        if (retried && !hasAccessToken()) {
          await tryRefreshAccessToken()
        }
        return retried
      }
    } catch {
      // ignore session hint failures
    }

    return false
  }

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
      setSubmitError(getErrorMessage(err, "Failed to send business email OTP"))
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
      setSubmitError("Enter a valid primary number to verify")
      return false
    }

    const countryCode = selectedCountryCode || getResolvedCountryCode()

    if (!countryCode) {
      setSubmitError("Please select country code.")
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
      setSubmitError("Enter a valid WhatsApp number to verify")
      return false
    }

    const countryCode = selectedCountryCode || getResolvedCountryCode()

    if (!countryCode) {
      setSubmitError("Please select country code.")
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
      setSubmitError("Failed to send mobile OTP. Please try again.")
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
      setSubmitError("Failed to send WhatsApp OTP. Please try again.")
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
      setOtpError("Failed to resend OTP. Please try again.")
    } finally {
      setOtpResending(false)
    }
  }

  const handleVerifyPan = async () => {
    const pan = form.pan.trim().toUpperCase()

    if (!pan || panVerified || verifyingPan) return
    setPanStatusText("")
    if (!PAN_REGEX.test(pan)) {
      setSubmitError("Invalid PAN number")
      return
    }
    if (!branchId) {
      setPanStatusText("PAN verification will be available right after branch creation.")
      return
    }
    if (!(await ensureAuthSessionReady())) {
      setSubmitError("Session expired. Please login again.")
      redirectToBusinessRegisterLogin(router)
      return
    }

    try {
      setSubmitError("")
      setVerifyingPan(true)
      await verifyPanForBranch({ pan, branch_id: branchId })
      setPanVerified(true)
      setPanStatusText("PAN verified successfully.")
      setCookie("verified_pan", pan, { maxAge: 60 * 60 * 24 * 7, path: "/" })
    } catch (err) {
      setPanVerified(false)
      setPanStatusText(getErrorMessage(err, "PAN verification failed"))
    } finally {
      setVerifyingPan(false)
    }
  }

  const handleVerifyGst = async () => {
    const gstin = form.gstin.trim().toUpperCase()

    if (!gstin || gstVerified || verifyingGst) return
    setGstStatusText("")
    if (!GST_REGEX.test(gstin)) {
      setSubmitError("Invalid GSTIN number")
      return
    }
    if (!branchId) {
      setGstStatusText("GSTIN verification will be available right after branch creation.")
      return
    }
    if (!(await ensureAuthSessionReady())) {
      setSubmitError("Session expired. Please login again.")
      redirectToBusinessRegisterLogin(router)
      return
    }

    try {
      setSubmitError("")
      setVerifyingGst(true)
      await verifyGstForBranch({ gstin, branch_id: branchId })
      setGstVerified(true)
      setGstStatusText("GSTIN verified successfully.")
      setCookie("verified_gstin", gstin, { maxAge: 60 * 60 * 24 * 7, path: "/" })
    } catch (err) {
      setGstVerified(false)
      setGstStatusText(getErrorMessage(err, "GSTIN verification failed"))
    } finally {
      setVerifyingGst(false)
    }
  }

  const handleSubmit = async () => {
    const businessName = normalizeBusinessLabel(form.businessName)
    const displayName = normalizeBusinessLabel(form.displayName)
    const businessType = form.businessType
    const placeId = form.placeId.trim()
    const primaryNumber = form.primaryNumber.trim()
    const whatsappNumber = form.whatsappNumber.trim()
    const effectiveWhatsappNumber = whatsappNumber || primaryNumber
    const businessWebsite = form.businessWebsite.trim()
    const businessEmail = form.businessEmail.trim()
    const pan = form.pan.trim().toUpperCase()
    const gstin = form.gstin.trim().toUpperCase()

    if (!businessName) {
      setSubmitError("Business name is required")
      return
    }
    if (!displayName) {
      setSubmitError("Display name is required")
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
      setSubmitError("Main category is not available right now. Please retry in a moment.")
      return
    }
    if (businessType === "") {
      setSubmitError("Business type is required")
      return
    }
    if (!primaryNumber || !MOBILE_REGEX.test(primaryNumber)) {
      setSubmitError("Valid primary number is required")
      return
    }
    if (!mobileVerified) {
      setSubmitError("Please verify business mobile number before registration")
      return
    }
    if (form.seanebId.trim() && !seanebVerified) {
      setSubmitError("Please verify SeaNeB ID before registration")
      return
    }
    if (!placeId) {
      setSubmitError("Business location is required")
      return
    }
    if (pan && !PAN_REGEX.test(pan)) {
      setSubmitError("Invalid PAN format")
      return
    }
    if (gstin && !GST_REGEX.test(gstin)) {
      setSubmitError("Invalid GSTIN format")
      return
    }
    if (!form.agree) {
      setSubmitError("You must agree to the terms and conditions")
      return
    }
    if (!(await ensureAuthSessionReady())) {
      setSubmitError("Session expired. Please login again.")
      redirectToBusinessRegisterLogin(router)
      return
    }

    setSubmitError("")

    await runWithTransition(
      async () => {
        const response = await registerBusiness({
          business_name: businessName,
          display_name: displayName,
          main_category_id: resolvedMainCategoryId,
          business_type: Number(form.businessType),
          seaneb_id: form.seanebId.trim(),
          primary_number: primaryNumber,
          whatsapp_number: effectiveWhatsappNumber,
          business_website: businessWebsite || undefined,
          business_email: businessEmail || undefined,
          about_branch: form.aboutBranch.trim() || "Head office branch",
          address: form.businessLocation.trim(),
          landmark: form.landmark.trim(),
          place_id: placeId,
          pan,
          gstin,
          product_key: lockedProductKey,
        })
        return response
      },
      {
        onSuccess: async (response) => {
          const data = response?.data || response || {}
          // Attempt to hydrate any access token returned in response headers or body.
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
            for (const h of headerCandidates) {
              if (!h) continue
              headerAuth = String(h || "").trim()
              if (headerAuth) break
            }

            const headerToken = headerAuth && /^Bearer\s+/i.test(headerAuth)
              ? headerAuth.replace(/^Bearer\s+/i, "").trim()
              : headerAuth

            const bodyToken = String(
              data?.access_token || data?.accessToken || data?.token || data?.jwt || ""
            ).trim()

            // Also prefer CSRF token from headers or body if present
            const headerCsrf = String(
              headers?.["x-csrf-token"] || headers?.["x-xsrf-token"] || headers?.["x-csrf_token"] || headers?.["x-csrf"] || ""
            ).trim()

            const bodyCsrf = String(
              data?.csrf_token || data?.csrfToken || data?.csrf || ""
            ).trim()

            const finalToken = headerToken || bodyToken || ""
            const finalCsrf = headerCsrf || bodyCsrf || ""

            if (finalToken || finalCsrf) {
              try {
                hydrateAuthSession({ accessToken: finalToken, csrfToken: finalCsrf, broadcast: true })
              } catch (e) {
                // ignore
              }
            }
          } catch (e) {
            // ignore token extraction errors
          }
          const businessId = data?.business_id || data?.id || ""
          const createdBranchId = String(data?.branch_id || data?.default_branch_id || "")
          setBranchId(createdBranchId)

          if (createdBranchId && pan && !panVerified && PAN_REGEX.test(pan)) {
            try {
              await verifyPanForBranch({ pan, branch_id: createdBranchId })
              setPanVerified(true)
              setPanStatusText("PAN verified successfully.")
              setCookie("verified_pan", pan, { maxAge: 60 * 60 * 24 * 7, path: "/" })
            } catch {
              setPanStatusText("PAN could not be verified right now. You can retry from dashboard.")
            }
          }

          if (createdBranchId && gstin && !gstVerified && GST_REGEX.test(gstin)) {
            try {
              await verifyGstForBranch({ gstin, branch_id: createdBranchId })
              setGstVerified(true)
              setGstStatusText("GSTIN verified successfully.")
              setCookie("verified_gstin", gstin, { maxAge: 60 * 60 * 24 * 7, path: "/" })
            } catch {
              setGstStatusText("GSTIN could not be verified right now. You can retry from dashboard.")
            }
          }

          setCookie("business_name", businessName, { path: "/" })
          setCookie("business_type", String(form.businessType), { path: "/" })
          setCookie("business_location", form.businessLocation, { path: "/" })
          setCookie("business_id", String(businessId), { path: "/" })
          setCookie("branch_id", createdBranchId, { path: "/" })
          setCookie("business_registered", "true", {
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
          })
          setDashboardMode(DASHBOARD_MODE_BUSINESS)

          setCookie("profile_completed", "true", {
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
          })
          // Try to hydrate client session (refresh access token into memory)
          let sessionHydrated = false
          try {
            sessionHydrated = await ensureSessionReady({ force: true })
            if (!sessionHydrated) {
              const waitResult = await waitForAuthCookies()
              if (waitResult?.ok) {
                sessionHydrated = await ensureSessionReady({ force: true })
              }
            }
          } catch (e) {
            console.warn("[business-register] ensureSessionReady failed after registration:", e)
            sessionHydrated = false
          }

          // If initial hydration failed, attempt a manual /api/auth/refresh request
          // which may return an access token in headers or body that our bootstrap
          // flow missed due to timing or CSRF differences.
          if (!sessionHydrated) {
            try {
              const productKey = String(getDefaultProductKey() || "property").trim()
              const csrfToken = String(getCsrfToken() || "").trim()
              const refreshUrl = `${String(API_BASE_URL || "").trim().replace(/\/+$/, "") || "/api"}/auth/refresh`
              logAuthDebug("[business-register] manual refresh after register", {
                hasCsrfHeader: Boolean(csrfToken),
              })
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

              // Prefer Authorization header
              const respAuth = String(
                refreshResp.headers.get("authorization") || refreshResp.headers.get("Authorization") || ""
              ).trim()
              const respHeaderToken = respAuth && /^Bearer\s+/i.test(respAuth)
                ? respAuth.replace(/^Bearer\s+/i, "").trim()
                : respAuth

              const respBodyToken = String(
                refreshPayload?.access_token || refreshPayload?.accessToken || refreshPayload?.token || refreshPayload?.jwt || ""
              ).trim()

              const finalRefreshToken = respHeaderToken || respBodyToken || ""
              if (finalRefreshToken) {
                try {
                  hydrateAuthSession({ accessToken: finalRefreshToken, broadcast: true })
                } catch (e) {
                  // ignore
                }
              }

              // Retry session hydrate after manual refresh attempt
              try {
                sessionHydrated = await ensureSessionReady({ force: true })
              } catch (e) {
                sessionHydrated = false
              }
            } catch (manErr) {
              console.warn("[business-register] manual refresh attempt failed:", manErr)
            }
          }

          notifyAuthChanged()
          if (!sessionHydrated) {
            logAuthDebug("[business-register] session not hydrated; continuing with cookie session")
            finalizeRegistration({ router, businessId, branchId: createdBranchId })
            return
          }
          finalizeRegistration({ router, businessId, branchId: createdBranchId })
        },
        onError: (err) => {
          (async () => {
            const status = Number(err?.response?.status || 0)
            const data = err?.response?.data || err?.response || {}

            const maybeBusinessId =
              data?.business_id || data?.id || data?.data?.business_id || data?.data?.id || data?.result?.business_id || data?.result?.id || ""
            const maybeBranchId = String(
              data?.branch_id || data?.default_branch_id || data?.data?.branch_id || data?.data?.default_branch_id || ""
            )

            // If auth error but payload contains created business/branch info,
            // treat it as a success fallback instead of forcing login.
            if ((status === 401 || status === 403) && !maybeBusinessId && !maybeBranchId) {
              redirectToBusinessRegisterLogin(router)
              return
            }

            if (maybeBusinessId || maybeBranchId) {
              try {
                const businessName = normalizeBusinessLabel(form.businessName)
                const businessId = maybeBusinessId || ""
                const createdBranchId = maybeBranchId || ""

                setBranchId(createdBranchId)

                setCookie("business_name", businessName, { path: "/" })
                setCookie("business_type", String(form.businessType), { path: "/" })
                setCookie("business_location", form.businessLocation, { path: "/" })
                setCookie("business_id", String(businessId), { path: "/" })
                setCookie("branch_id", createdBranchId, { path: "/" })
                setCookie("business_registered", "true", {
                  maxAge: 60 * 60 * 24 * 30,
                  path: "/",
                })
                setDashboardMode(DASHBOARD_MODE_BUSINESS)

                setCookie("profile_completed", "true", {
                  maxAge: 60 * 60 * 24 * 30,
                  path: "/",
                })

                let recoveredSession = false
                try {
                  recoveredSession = await ensureSessionReady({ force: true })
                  if (!recoveredSession) {
                    const waitResult = await waitForAuthCookies()
                    if (waitResult?.ok) {
                      recoveredSession = await ensureSessionReady({ force: true })
                    }
                  }
                } catch {
                  recoveredSession = false
                }

                notifyAuthChanged()
                if (!recoveredSession) {
                  redirectToBusinessRegisterLogin(router, "/dashboard/broker")
                  return
                }
                finalizeRegistration({ router, businessId, branchId: createdBranchId })
                return
              } catch (fallbackErr) {
                // If fallback processing fails, fall through to show error below.
                console.warn("[business-register] fallback success handling failed:", fallbackErr)
              }
            }

            setSubmitError(getErrorMessage(err, "Registration failed"))
          })()
        },
      }
    )
  }

  if (!mounted) return null
  if (showTransition) {
    return (
      <AuthTransitionOverlay
        title="Registering business..."
        description="Creating your business profile and preparing your dashboard."
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
            <h1 className="business-register-title">Register Your Business</h1>
            <p className="business-register-subtitle">Set up your branch profile to start listing and managing leads.</p>
          </div>
          <div className="business-register-progress">
            <div className="business-register-progress-meta">
              <span>Step {currentStep} of {WIZARD_STEPS.length}</span>
              <strong>{currentStepMeta.title}</strong>
            </div>
            <div className="business-register-progress-track">
              <span style={{ width: `${completionPercent}%` }} />
            </div>
          </div>
          <div className="business-wizard-stepper">
            {WIZARD_STEPS.map((step) => {
              const isActive = step.id === currentStep
              const isDone = step.id < currentStep
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`business-wizard-step ${isActive ? "active" : ""} ${isDone ? "done" : ""} min-h-[38px]`}
                  onClick={() => handleStepChange(step.id)}
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
              <h2>Business Basics</h2>
              <p>Core identity details visible to your customers.</p>
            </div>
            <div className="business-grid business-grid--2">
              <Field label="Business Name *" hint="Type at least 2 letters for name suggestions.">
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
                        <div className="autocomplete-item loading">Loading...</div>
                      )}

                      {!businessSuggestLoading && businessSuggestions.length === 0 && (
                        <div className="autocomplete-item">No businesses found</div>
                      )}

                      {!businessSuggestLoading &&
                        businessSuggestions.map((item, index) => {
                          const label = getBusinessSuggestionLabel(item)
                          const placeId = getBusinessSuggestionPlaceId(item)
                          if (!label) return null

                          return (
                            <div
                              key={placeId || `${label}-${index}`}
                              className="autocomplete-item"
                              onMouseDown={() => {
                                suppressNextBusinessAutocompleteRef.current = true
                                setForm((prev) => ({
                                  ...prev,
                                  businessName: normalizeBusinessLabel(label),
                                  placeId: placeId || prev.placeId,
                                }))
                                setBusinessSuggestOpen(false)
                              }}
                            >
                              {label}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Display Name *">
                <input type="text" className="business-form-input" value={form.displayName} onChange={(e) => setField("displayName", e.target.value)} />
              </Field>

              <Field label="Category *">
                <select className="business-form-select" value={form.mainCategoryId} onChange={(e) => setField("mainCategoryId", e.target.value)}>
                  <option value="">Select a category</option>
                  {categories.length > 0 ? (
                    categories.map((category) => (
                      <option key={category.main_category_id || category.id} value={category.main_category_id || category.id}>
                        {category.main_category_name || category.name || "Unnamed"}
                      </option>
                    ))
                  ) : (
                    <option value="">No categories available</option>
                  )}
                </select>
              </Field>

              <Field label="Business Type *">
                <select className="business-form-select" value={form.businessType} onChange={(e) => setField("businessType", e)}>
                  <option value="">Select business type</option>
                  <option value="0">Individual Agent</option>
                  <option value="1">Real Estate Agency</option>
                  <option value="2">Developer</option>
                  <option value="3">Broker Firm</option>
                </select>
              </Field>

              <div className="md:col-span-2">
                <SeanebIdField
                  value={form.seanebId}
                  onChange={(v) => setField("seanebId", v)}
                  verified={seanebVerified}
                  setVerified={setSeanebVerified}
                />
              </div>
            </div>
          </section>
          )}

          {currentStep === 2 && (
          <section className="business-section-card business-section-card--contact">
            <div className="business-section-head">
              <h2>Contact Information</h2>
              <p>How can customers reach you?</p>
            </div>
            <div className="business-contact-grid">
              <Field label="Business Email (Optional)" hint="Optional. You can verify it now or later." className="business-contact-grid-email">
                <div className="business-inline-action business-inline-action--soft">
                  <input
                    type="email"
                    className={`business-form-input ${emailVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={form.businessEmail}
                    disabled={emailVerified}
                    onChange={(e) => setField("businessEmail", e.target.value)}
                    placeholder="Enter business email"
                  />
                  <button
                    type="button"
                    onClick={emailVerified ? handleEnableEmailEdit : handleEmailVerify}
                    disabled={emailLoading || (!emailVerified && !form.businessEmail.trim()) || (emailVerified && emailEditCooldown > 0)}
                    className="business-inline-action-btn"
                  >
                    {emailLoading ? "Sending..." : emailVerified ? "Edit" : "Verify"}
                  </button>
                </div>
                {emailVerified && emailEditCooldown > 0 && (
                  <p className="business-verify-note">Try to edit in {formatCooldown(emailEditCooldown)}</p>
                )}
              </Field>

              <Field label="Primary Mobile Number *" className="business-contact-grid-primary">
                <div className="business-phone-row">
                  <CountryCodePicker
                    value={selectedCountry}
                    options={COUNTRY_OPTIONS}
                    onChange={setSelectedCountry}
                  />
                  <div className="business-phone-input-wrap">
                    <input
                      type="text"
                      className={`business-form-input ${mobileVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                      value={form.primaryNumber}
                      disabled={mobileVerified}
                      onChange={(e) => setField("primaryNumber", e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter mobile number"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={mobileVerified ? handleEnableMobileEdit : handleMobileVerify}
                    disabled={mobileLoading || (!mobileVerified && !form.primaryNumber.trim()) || (mobileVerified && mobileEditCooldown > 0)}
                    className="business-inline-action-btn"
                  >
                    {mobileLoading ? "Sending..." : mobileVerified ? "Edit" : "Verify"}
                  </button>
                </div>
                {!mobileVerified && (
                  <p className="business-verify-note">OTP will be sent to this number.</p>
                )}
                {mobileVerified && mobileEditCooldown > 0 && (
                  <p className="business-verify-note">Try to edit in {formatCooldown(mobileEditCooldown)}</p>
                )}
              </Field>

              <Field label="WhatsApp Number" hint="Optional. Leave blank to use the primary number." className="business-contact-grid-whatsapp">
                <div className="business-phone-row">
                  <CountryCodePicker
                    value={selectedCountry}
                    options={COUNTRY_OPTIONS}
                    onChange={setSelectedCountry}
                  />
                  <div className="business-phone-input-wrap">
                    <input
                      type="text"
                      className={`business-form-input ${whatsappIsVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                      value={form.whatsappNumber}
                      disabled={whatsappIsVerified && !whatsappAutoVerified}
                      onChange={(e) => setField("whatsappNumber", e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter WhatsApp number"
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
                      ? "Sending..."
                      : whatsappIsVerified
                        ? whatsappAutoVerified
                          ? "Verified"
                          : "Edit"
                        : "Verify"}
                  </button>
                </div>
                {!whatsappIsVerified && form.whatsappNumber.trim() && (
                  <p className="business-verify-note">OTP will be sent on WhatsApp to this number.</p>
                )}
                {whatsappAutoVerified && (
                  <p className="business-verify-note">
                    Using the same number as primary. WhatsApp verification not required.
                  </p>
                )}
                {whatsappIsVerified && !whatsappAutoVerified && whatsappEditCooldown > 0 && (
                  <p className="business-verify-note">Try to edit in {formatCooldown(whatsappEditCooldown)}</p>
                )}
              </Field>

              <Field label="Business Website (Optional)" hint="Optional. Add your website URL if you have one." className="business-contact-grid-website">
                <input
                  type="url"
                  className="business-form-input"
                  value={form.businessWebsite}
                  onChange={(e) => setField("businessWebsite", e.target.value)}
                  placeholder="https://yourbusiness.com"
                />
              </Field>
            </div>
          </section>
          )}

          {currentStep === 3 && (
          <section className="business-section-card">
            <div className="business-section-head">
              <h2>Branch Address</h2>
              <p>Add accurate location details so listings and local discovery work correctly.</p>
            </div>
            <div className="business-grid business-grid--2">
              <Field label="About Branch *">
                <input type="text" className="business-form-input" value={form.aboutBranch} onChange={(e) => setField("aboutBranch", e.target.value)} />
              </Field>

              <Field label="Landmark">
                <input type="text" className="business-form-input" value={form.landmark} onChange={(e) => setField("landmark", e.target.value)} />
              </Field>

              <Field label="Business Location *" hint="Select a valid location from autocomplete results.">
                <AutoComplete
                  value={form.businessLocation}
                  onChange={(v) => setField("businessLocation", v)}
                  onSelect={(city) => setField("placeId", city?.place_id || city?.city_id || "")}
                />
              </Field>
            </div>
          </section>
          )}

          {currentStep === 3 && (
          <section className="business-section-card">
            <div className="business-section-head">
              <h2>Compliance (Optional)</h2>
              <p>You can verify PAN and GST now or later from your dashboard.</p>
            </div>
            <div className="business-grid business-grid--2">
              <Field label="PAN (optional)">
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
                    {verifyingPan ? "Verifying..." : panVerified ? "Verified" : "Verify"}
                  </button>
                </div>
                {panStatusText && <p className="business-verify-note">{panStatusText}</p>}
              </Field>

              <Field label="GSTIN (optional)">
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
                    {verifyingGst ? "Verifying..." : gstVerified ? "Verified" : "Verify"}
                  </button>
                </div>
                {gstStatusText && <p className="business-verify-note">{gstStatusText}</p>}
              </Field>
            </div>
          </section>
          )}

          {currentStep === 3 && (
            <div className="business-submit-panel">
              <div className="checkbox-row">
                <input type="checkbox" id="agree" checked={form.agree} onChange={(e) => setField("agree", e.target.checked)} />
                <label htmlFor="agree" className="text-sm cursor-pointer">
                  I agree to the business{" "}
                  <button
                    type="button"
                    onClick={() => setTermsModalOpen(true)}
                    className="text-blue-600 underline"
                  >
                    terms and conditions
                  </button>
                </label>
              </div>
            </div>
          )}

          <div className="business-wizard-nav pt-1">
            <button
              type="button"
              className="business-wizard-btn business-wizard-btn--ghost inline-flex items-center justify-center"
              onClick={goPreviousStep}
              disabled={currentStep === 1}
            >
              Previous
            </button>
            {currentStep < WIZARD_STEPS.length ? (
              <button
                type="button"
                className="business-wizard-btn business-wizard-btn--primary inline-flex items-center justify-center"
                onClick={goNextStep}
                disabled={false}
              >
                Next
              </button>
            ) : (
              <Button
                type="submit"
                label={isTransitioning ? (t.loading || "Registering...") : "Register Business"}
                disabled={isTransitioning || !isStepThreeReady}
                className="max-w-[220px]"
              />
            )}
          </div>
        </form>
      </div>

      <OtpVerificationModal
        open={otpModalOpen}
        title={
          otpModalType === "email"
            ? "Verify Business Email"
            : otpModalType === "whatsapp"
              ? "Verify WhatsApp Number"
              : "Verify Business Mobile"
        }
        subtitle={
          otpModalType === "email"
            ? "Enter the 4-digit OTP sent to"
            : otpModalType === "whatsapp"
              ? "Enter the 4-digit OTP sent by WhatsApp"
              : `Enter the 4-digit OTP sent by ${getOtpChannelLabel(mobileOtpVia)}`
        }
        targetLabel={otpModalTarget}
        helperText={
          otpModalType === "mobile"
            ? mobileOtpVia === OTP_VIA_SMS
              ? "If the SMS does not arrive, wait for the timer to finish and resend the OTP on WhatsApp."
              : "We sent the OTP on WhatsApp to the same primary number."
            : otpModalType === "whatsapp"
              ? "We sent the OTP on WhatsApp to the number above."
            : "Use the code from your inbox to complete verification."
        }
        otp={otpValue}
        onOtpChange={setOtpValue}
        onClose={closeOtpModal}
        onVerify={handleVerifyInlineOtp}
        onResend={() => handleResendInlineOtp(otpModalType === "mobile" ? OTP_VIA_SMS : undefined)}
        resendLabel={otpModalType === "mobile" ? "Resend by SMS" : "Resend OTP"}
        onSecondaryResend={
          otpModalType === "mobile" ? () => handleResendInlineOtp(OTP_VIA_WHATSAPP) : undefined
        }
        secondaryResendLabel={otpModalType === "mobile" ? "Resend on WhatsApp" : ""}
        loading={otpVerifying}
        resending={otpResending}
        cooldown={otpResendCooldown}
        error={otpError}
        clearSignal={otpClearSignal}
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

function CountryCodePicker({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef(null)
  const normalizedQuery = query.trim().toLowerCase()

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
              placeholder="Search country or code"
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
              <div className="business-country-empty">No country found.</div>
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

