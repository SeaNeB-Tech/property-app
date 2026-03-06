"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
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
import { verifyOtpAndLogin } from "@/app/auth/auth-service/authservice"
import { ensureSessionReady } from "@/app/auth/auth-service/auth.bootstrap"
import { createMainCategory, getAllActiveCategories } from "@/app/auth/auth-service/category.service"
import { getDefaultProductName, getDefaultProductKey, setDefaultProductKey } from "@/services/dashboard.service"
import { setDashboardMode, DASHBOARD_MODE_BUSINESS } from "@/services/dashboard.service"
import { API } from "@/lib/config/apiPaths"
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
const DEFAULT_MAIN_CATEGORY_ID = process.env.NEXT_PUBLIC_MAIN_CATEGORY_ID || ""
const OTP_VIA_WHATSAPP = "whatsapp"
const OTP_VIA_SMS = "sms"
const RESEND_COOLDOWN_SECONDS = 60
const VERIFIED_EDIT_COOLDOWN_SECONDS = 60
const TERMS_TEXT_PATH = "/legal/terms-conditions-property.txt"
const LANGUAGE_STORAGE_KEY = "auth_language"

const EMPTY_FORM = {
  businessName: "",
  displayName: "",
  mainCategoryId: DEFAULT_MAIN_CATEGORY_ID,
  businessType: "",
  seanebId: "",
  primaryNumber: "",
  whatsappNumber: "",
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

const readProfilePayload = (payload) => {
  const profile =
    payload?.data?.profile ||
    payload?.data?.user ||
    payload?.data ||
    payload?.profile ||
    payload?.user ||
    payload
  return profile && typeof profile === "object" ? profile : null
}

const fetchWithSessionRefresh = async (url, options = {}) => {
  const requestOnce = () =>
    fetch(url, {
      ...options,
      credentials: "include",
      cache: options.cache || "no-store",
    })

  const firstResponse = await requestOnce()
  if (firstResponse.status !== 401) return firstResponse

  const refreshResponse = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_key: String(getDefaultProductKey() || "property").trim() || "property" }),
  })

  if (!refreshResponse.ok) return firstResponse
  return requestOnce()
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

const DEFAULT_COUNTRY =
  getCountryByCode("91") ||
  phoneCodes[0] || { name: "India", dialCode: "+91" }

const WIZARD_STEPS = [
  { id: 1, title: "Basic Info" },
  { id: 2, title: "Contact" },
  { id: 3, title: "Location & Compliance" },
]
const notifyMainAppBusinessRegisterSuccess = () => {
  if (typeof window === "undefined") return
  const configuredMainOrigin = String(process.env.NEXT_PUBLIC_APP_ORIGIN || "").trim()
  if (!configuredMainOrigin) {
    console.warn("[business-register] NEXT_PUBLIC_APP_ORIGIN is missing; skipping cross-tab success message.")
    return false
  }

  if (!window.opener) {
    console.warn("[business-register] window.opener is not available; skipping cross-tab success message.")
    return false
  }

  try {
    console.log("[business-register] Sending auth success message to opener")
    window.opener.postMessage(
      { type: "SEANEB_BUSINESS_REGISTER_SUCCESS" },
      configuredMainOrigin
    )
    return true
  } catch {
    console.warn("[business-register] postMessage failed; continuing local redirect flow.")
    return false
  }
}

const redirectToBusinessRegisterLogin = (router) => {
  const returnTo = "/auth/business-register?source=main-app-register"
  router.replace(
    `/auth/login?source=main-app-register&returnTo=${encodeURIComponent(returnTo)}`
  )
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
  const [mobileOtpVia, setMobileOtpVia] = useState(OTP_VIA_WHATSAPP)
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
  const isStepThreeReady =
    form.businessLocation.trim().length > 0 &&
    form.placeId.trim().length > 0 &&
    form.agree

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
    if (emailEditCooldown <= 0 && mobileEditCooldown <= 0) return
    const timer = window.setInterval(() => {
      setEmailEditCooldown((prev) => (prev > 0 ? prev - 1 : 0))
      setMobileEditCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [emailEditCooldown, mobileEditCooldown])

  useEffect(() => {
    const init = async () => {
      const profileCompleted = getCookie("profile_completed")
      const hasSession = await ensureSessionReady()

      if (!hasSession) {
        redirectToBusinessRegisterLogin(router)
        return
      }
      if (profileCompleted !== "true" && hasSession) {
        setCookie("profile_completed", "true", {
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        })
      }

      // If business was already registered earlier, do not show registration again.
      const hasBusinessCookie = getCookie("business_registered") === "true"
      const existingBranchId = String(getCookie("branch_id") || "").trim()
      if (hasBusinessCookie || existingBranchId) {
        router.replace("/dashboard/broker")
        return
      }

      const verifiedMobile = getJsonCookie("verified_mobile")
      const regDraft = getJsonCookie("reg_form_draft")
      const verifiedBusinessEmail = getCookie("verified_business_email")
      const verifiedPan = getCookie("verified_pan")
      const verifiedGstin = getCookie("verified_gstin")
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
        regDraft?.whatsappNumber || verifiedMobile?.mobile_number || ""
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
      if (verifiedPan) {
        setPanVerified(true)
      }
      if (verifiedGstin) {
        setGstVerified(true)
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

  const ensureAuthSessionReady = async () => {
    return ensureSessionReady({ force: true })
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

  const handleMobileVerify = async () => {
    const mobile = form.primaryNumber.trim()
    if (!mobile || mobileLoading || mobileVerified) return
    const selectedCountryCode = normalizeCountryCode(selectedCountry?.dialCode)

    if (!MOBILE_REGEX.test(mobile)) {
      setSubmitError("Enter a valid primary number to verify")
      return
    }

    const countryCode = selectedCountryCode || getResolvedCountryCode()

    if (!countryCode) {
      setSubmitError("Please select country code.")
      return
    }

    setCookie("otp_cc", countryCode, { maxAge: 60 * 60 * 24 * 7, path: "/" })

    try {
      setMobileLoading(true)
      setSubmitError("")

      setJsonCookie(
        "otp_context",
        {
          country_code: countryCode,
          mobile_number: mobile,
          via: mobileOtpVia,
          purpose: PURPOSE_BUSINESS_MOBILE_VERIFY,
          redirect_to: "/auth/business-register",
        },
        { maxAge: 300, path: "/" }
      )

      await sendOtp({ via: mobileOtpVia, disableFallback: true })

      setOtpValue("")
      setOtpClearSignal((value) => value + 1)
      setOtpModalType("mobile")
      setOtpModalTarget(`${mobileOtpVia === OTP_VIA_SMS ? "SMS" : "WhatsApp"}: +${countryCode} ${mobile}`)
      setOtpResendCooldown(RESEND_COOLDOWN_SECONDS)
      setOtpModalOpen(true)
    } catch (err) {
      setSubmitError("Failed to send mobile OTP. Please try again.")
    } finally {
      setMobileLoading(false)
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

  const handleEnableEmailEdit = () => {
    if (emailEditCooldown > 0) return
    setEmailVerified(false)
    removeCookie("verified_business_email")
  }

  const handleResendInlineOtp = async () => {
    if (otpResending || otpResendCooldown > 0) return

    try {
      setOtpResending(true)
      setOtpError("")

      if (otpModalType === "email") {
        const email = form.businessEmail.trim()
        await sendEmailOtp({ email, purpose: PURPOSE_BUSINESS_EMAIL_VERIFY })
      } else if (otpModalType === "mobile") {
        const ctx = getJsonCookie("otp_context")
        const channel = String(ctx?.via || mobileOtpVia || OTP_VIA_WHATSAPP).toLowerCase() === OTP_VIA_SMS
          ? OTP_VIA_SMS
          : OTP_VIA_WHATSAPP
        setMobileOtpVia(channel)
        setJsonCookie(
          "otp_context",
          {
            ...(ctx || {}),
            via: channel,
            country_code:
              String(ctx?.country_code || "").trim() ||
              normalizeCountryCode(selectedCountry?.dialCode),
          },
          { maxAge: 300, path: "/" }
        )
        await sendOtp({ via: channel, disableFallback: true })
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

          try {
            const meResponse = await fetchWithSessionRefresh(API.PROFILE, { method: "GET" })
            if (meResponse.ok) {
              const mePayload = await meResponse.json()
              const latestProfile = readProfilePayload(mePayload)
              if (typeof window !== "undefined" && latestProfile) {
                window.__SEANEB_AUTH_USER__ = latestProfile
              }
            }
          } catch {
            // Best-effort only. Redirect flow should continue.
          }

          const sentSuccessMessage = notifyMainAppBusinessRegisterSuccess()
          notifyAuthChanged()
          if (!sentSuccessMessage) {
            console.warn("[business-register] Main app handshake did not complete; continuing to broker dashboard.")
          }
          router.replace("/dashboard/broker")
        },
        onError: (err) => {
          const status = Number(err?.response?.status || 0)
          if (status === 401 || status === 403) {
            redirectToBusinessRegisterLogin(router)
            return
          }
          setSubmitError(getErrorMessage(err, "Registration failed"))
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
          <section className="business-section-card">
            <div className="business-section-head">
              <h2>Contact Details</h2>
              <p>Numbers and email used for branch communication and verification.</p>
            </div>
            <div className="business-grid business-grid--2">
              <Field label="Country Code *">
                <select
                  className="business-form-select"
                  value={String(selectedCountry?.dialCode || "")}
                  onChange={(e) => {
                    const next = getCountryByCode(e.target.value)
                    if (next) setSelectedCountry(next)
                  }}
                >
                  {phoneCodes.map((country) => (
                    <option key={`${country.name}-${country.dialCode}`} value={country.dialCode}>
                      {country.name} ({country.dialCode})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Primary Number *">
                <div className="business-inline-action">
                  <input
                    type="text"
                    className={`business-form-input ${mobileVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={form.primaryNumber}
                    disabled={mobileVerified}
                    onChange={(e) => setField("primaryNumber", e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    type="button"
                    onClick={mobileVerified ? handleEnableMobileEdit : handleMobileVerify}
                    disabled={mobileLoading || (!mobileVerified && !form.primaryNumber.trim()) || (mobileVerified && mobileEditCooldown > 0)}
                    className="h-11 min-w-[110px] rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {mobileLoading ? "Sending..." : mobileVerified ? "Edit" : "Verify"}
                  </button>
                </div>
                {mobileVerified && mobileEditCooldown > 0 && (
                  <p className="business-verify-note">Try to edit in {formatCooldown(mobileEditCooldown)}</p>
                )}
              </Field>

              <Field label="Send Mobile OTP Via">
                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="business_mobile_otp_via"
                      checked={mobileOtpVia === OTP_VIA_WHATSAPP}
                      onChange={() => setMobileOtpVia(OTP_VIA_WHATSAPP)}
                    />
                    WhatsApp
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="business_mobile_otp_via"
                      checked={mobileOtpVia === OTP_VIA_SMS}
                      onChange={() => setMobileOtpVia(OTP_VIA_SMS)}
                    />
                    SMS
                  </label>
                </div>
              </Field>

              <Field label="WhatsApp Number">
                <div>
                  <input
                    type="text"
                    className="business-form-input"
                    value={form.whatsappNumber}
                    onChange={(e) => setField("whatsappNumber", e.target.value.replace(/\D/g, ""))}
                  />
                  {mobileVerified &&
                    form.primaryNumber.trim() &&
                    (form.whatsappNumber.trim() || form.primaryNumber.trim()) === form.primaryNumber.trim() && (
                      <p className="business-verify-note">Same as primary number. No separate verification required.</p>
                  )}
                </div>
              </Field>

              <Field label="Business Email (Optional)" hint="You can leave this blank or verify it when needed.">
                <div className="business-inline-action">
                  <input
                    type="email"
                    className={`business-form-input ${emailVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={form.businessEmail}
                    disabled={emailVerified}
                    onChange={(e) => setField("businessEmail", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={emailVerified ? handleEnableEmailEdit : handleEmailVerify}
                    disabled={emailLoading || (!emailVerified && !form.businessEmail.trim()) || (emailVerified && emailEditCooldown > 0)}
                    className="h-11 min-w-[110px] rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {emailLoading ? "Sending..." : emailVerified ? "Edit" : "Verify"}
                  </button>
                </div>
                {emailVerified && emailEditCooldown > 0 && (
                  <p className="business-verify-note">Try to edit in {formatCooldown(emailEditCooldown)}</p>
                )}
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
        title={otpModalType === "email" ? "Verify Business Email" : "Verify Business Mobile"}
        subtitle="Enter the 4-digit OTP sent to"
        targetLabel={otpModalTarget}
        otp={otpValue}
        onOtpChange={setOtpValue}
        onClose={closeOtpModal}
        onVerify={handleVerifyInlineOtp}
        onResend={handleResendInlineOtp}
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

function Field({ label, hint, error, children }) {
  return (
    <div className="business-form-group">
      <label className="business-form-label">{label}</label>
      {children}
      {hint && !error && <p className="business-form-hint">{hint}</p>}
      {error && <p className="business-form-error-inline">{error}</p>}
    </div>
  )
}

