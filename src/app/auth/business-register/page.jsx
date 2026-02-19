"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { getCookie, getJsonCookie, setCookie, setJsonCookie, removeCookie } from "@/services/cookie"
import {
  registerBusiness,
  verifyPanForBranch,
  verifyGstForBranch,
  getBusinessAutocomplete,
} from "@/app/auth/auth-service/business.service"
import { sendEmailOtp, verifyEmailOtp } from "@/app/auth/auth-service/email.service"
import { sendOtp } from "@/app/auth/auth-service/otp.service"
import { verifyOtpAndLogin } from "@/app/auth/auth-service/authservice"
import { authStore } from "@/app/auth/auth-service/store/authStore"
import { bootstrapProductAuth } from "@/app/auth/auth-service/auth.bootstrap"
import { createMainCategory, getAllActiveCategories } from "@/app/auth/auth-service/category.service"
import { getDefaultProductName, getDefaultProductKey, setDefaultProductKey } from "@/services/pro.service"
import { setDashboardMode, DASHBOARD_MODE_BUSINESS } from "@/services/dashboardMode.service"
import useDebounce from "@/hooks/useDebounce"
import AuthCard1 from "@/components/ui/AuthCard1"
import AuthHeader from "@/components/ui/AuthHeader"
import Button from "@/components/ui/Button"
import AutoComplete from "@/components/ui/AutoComplete"
import SeanebIdField from "@/components/ui/SeanebId"
import OtpVerificationModal from "@/components/ui/OtpVerificationModal"

// i18n
import eng from "@/constants/i18/eng/business_register.json"
import guj from "@/constants/i18/guj/business_register.json"
import hindi from "@/constants/i18/hindi/business_register.json"

const LANG_MAP = { eng, guj, hindi }

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const MOBILE_REGEX = /^[0-9]{8,15}$/
const PURPOSE_BUSINESS_MOBILE_VERIFY = 2
const PURPOSE_BUSINESS_EMAIL_VERIFY = 3
const DEFAULT_MAIN_CATEGORY_ID = process.env.NEXT_PUBLIC_MAIN_CATEGORY_ID || ""

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

export default function BusinessRegisterPage() {
  const router = useRouter()
  const [language, setLanguage] = useState("eng")
  const [form, setForm] = useState(EMPTY_FORM)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [branchId, setBranchId] = useState("")
  const [panVerified, setPanVerified] = useState(false)
  const [gstVerified, setGstVerified] = useState(false)
  const [verifyingPan, setVerifyingPan] = useState(false)
  const [verifyingGst, setVerifyingGst] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [mobileVerified, setMobileVerified] = useState(false)
  const [mobileLoading, setMobileLoading] = useState(false)
  const [mobileCooldown, setMobileCooldown] = useState(0)
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [otpModalType, setOtpModalType] = useState("")
  const [otpModalTarget, setOtpModalTarget] = useState("")
  const [otpValue, setOtpValue] = useState("")
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpResending, setOtpResending] = useState(false)
  const [otpError, setOtpError] = useState("")
  const [otpClearSignal, setOtpClearSignal] = useState(0)
  const [seanebVerified, setSeanebVerified] = useState(false)
  const [panStatusText, setPanStatusText] = useState("")
  const [gstStatusText, setGstStatusText] = useState("")
  const [businessSuggestions, setBusinessSuggestions] = useState([])
  const [businessSuggestOpen, setBusinessSuggestOpen] = useState(false)
  const [businessSuggestLoading, setBusinessSuggestLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [productCategoryId, setProductCategoryId] = useState("")
  const lockedProductKeyRef = useRef("")
  const debouncedBusinessName = useDebounce(form.businessName, 300)

  const t = LANG_MAP[language]
  const requiredChecks = [
    form.businessName.trim().length > 0,
    form.businessType !== "",
    form.mainCategoryId.trim().length > 0,
    form.primaryNumber.trim().length > 0,
    mobileVerified,
    form.businessLocation.trim().length > 0,
    form.placeId.trim().length > 0,
    form.agree,
  ]
  const completedRequired = requiredChecks.filter(Boolean).length
  const completionPercent = Math.round((completedRequired / requiredChecks.length) * 100)

  useEffect(() => {
    const init = async () => {
      const profileCompleted = getCookie("profile_completed")
      try {
        // Recover access token if page was reloaded and only refresh/csrf cookies remain.
        if (!authStore.getAccessToken()) {
          await bootstrapProductAuth()
        }
      } catch (err) {
        console.warn("[business-register] Access token bootstrap failed:", err?.message || err)
      }

      // Allow dashboard users to open this page even if profile_completed cookie is missing.
      const hasSession = !!authStore.getAccessToken()
      if (profileCompleted !== "true" && !hasSession) {
        router.replace("/auth/login")
        return
      }
      if (profileCompleted !== "true" && hasSession) {
        setCookie("profile_completed", "true", {
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        })
      }

      const verifiedMobile = getJsonCookie("verified_mobile")
      const regDraft = getJsonCookie("reg_form_draft")
      const verifiedBusinessEmail = getCookie("verified_business_email")
      const verifiedBusinessMobile = getJsonCookie("verified_business_mobile")
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

      setForm((prev) => ({
        ...prev,
        mainCategoryId: String(autoMainCategoryId || prev.mainCategoryId || "").trim(),
        seanebId: regDraft?.seanebId || prev.seanebId,
        primaryNumber: verifiedMobile?.mobile_number || prev.primaryNumber,
        whatsappNumber: verifiedMobile?.mobile_number || prev.whatsappNumber,
        businessEmail: initialBusinessEmail || prev.businessEmail,
        pan: verifiedPan || prev.pan,
        gstin: verifiedGstin || prev.gstin,
      }))

      const existingBranchId = getCookie("branch_id")
      if (existingBranchId) {
        setBranchId(existingBranchId)
      }

      if (verifiedBusinessEmail && verifiedBusinessEmail === initialBusinessEmail) {
        setEmailVerified(true)
      }
      if (
        verifiedBusinessMobile?.mobile_number &&
        String(verifiedBusinessMobile.mobile_number) === String(verifiedMobile?.mobile_number || regDraft?.primaryNumber || "")
      ) {
        setMobileVerified(true)
      } else if (verifiedBusinessMobile?.mobile_number) {
        setMobileVerified(true)
        setForm((prev) => ({
          ...prev,
          primaryNumber: String(verifiedBusinessMobile.mobile_number),
          whatsappNumber: prev.whatsappNumber || String(verifiedBusinessMobile.mobile_number),
        }))
      }
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
    const verifiedBusinessMobile = getJsonCookie("verified_business_mobile")
    if (
      verifiedBusinessMobile?.mobile_number &&
      String(verifiedBusinessMobile.mobile_number) === form.primaryNumber.trim()
    ) {
      setMobileVerified(true)
    } else {
      setMobileVerified(false)
    }
  }, [form.primaryNumber])

  useEffect(() => {
    const until = Number(getCookie("email_otp_until") || 0)
    if (!until) return
    const diff = Math.floor((until - Date.now()) / 1000)
    if (diff > 0) setEmailCooldown(diff)
  }, [])

  useEffect(() => {
    if (emailCooldown <= 0) return
    const timer = setInterval(() => {
      setEmailCooldown((value) => {
        if (value <= 1) {
          removeCookie("email_otp_until")
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [emailCooldown])

  useEffect(() => {
    const until = Number(getCookie("business_mobile_otp_until") || 0)
    if (!until) return
    const diff = Math.floor((until - Date.now()) / 1000)
    if (diff > 0) setMobileCooldown(diff)
  }, [])

  useEffect(() => {
    if (mobileCooldown <= 0) return
    const timer = setInterval(() => {
      setMobileCooldown((value) => {
        if (value <= 1) {
          removeCookie("business_mobile_otp_until")
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [mobileCooldown])

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

  const ensureAccessToken = async () => {
    if (authStore.getAccessToken()) return true
    try {
      await bootstrapProductAuth()
      return !!authStore.getAccessToken()
    } catch {
      return false
    }
  }

  const handleEmailVerify = async () => {
    const email = form.businessEmail.trim()
    if (!email || emailLoading || emailVerified) return

    if (emailCooldown > 0) {
      setOtpModalType("email")
      setOtpModalTarget(email)
      setOtpModalOpen(true)
      return
    }

    try {
      setEmailLoading(true)
      setSubmitError("")
      setOtpError("")

      await sendEmailOtp({ email, purpose: PURPOSE_BUSINESS_EMAIL_VERIFY })

      const until = Date.now() + 60 * 1000
      setCookie("email_otp_until", String(until), {
        maxAge: 60,
        path: "/",
      })

      setEmailCooldown(60)
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

    if (mobileCooldown > 0) {
      const verifiedMobile = getJsonCookie("verified_mobile")
      const countryCode = String(verifiedMobile?.country_code || getCookie("otp_cc") || "").trim()
      setOtpModalType("mobile")
      setOtpModalTarget(countryCode ? `+${countryCode} ${mobile}` : mobile)
      setOtpModalOpen(true)
      return
    }

    if (!MOBILE_REGEX.test(mobile)) {
      setSubmitError("Enter a valid primary number to verify")
      return
    }

    const verifiedMobile = getJsonCookie("verified_mobile")
    const countryCode =
      String(verifiedMobile?.country_code || getCookie("otp_cc") || "").trim()

    if (!countryCode) {
      setSubmitError("Country code is missing. Please login again.")
      return
    }

    try {
      setMobileLoading(true)
      setSubmitError("")

      setJsonCookie(
        "otp_context",
        {
          country_code: countryCode,
          mobile_number: mobile,
          via: "whatsapp",
          purpose: PURPOSE_BUSINESS_MOBILE_VERIFY,
          redirect_to: "/auth/business-register",
        },
        { maxAge: 300, path: "/" }
      )

      await sendOtp({ via: "whatsapp" })

      const until = Date.now() + 60 * 1000
      setCookie("business_mobile_otp_until", String(until), { maxAge: 60, path: "/" })
      setMobileCooldown(60)
      setOtpValue("")
      setOtpClearSignal((value) => value + 1)
      setOtpModalType("mobile")
      setOtpModalTarget(`+${countryCode} ${mobile}`)
      setOtpModalOpen(true)
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Failed to send mobile OTP"))
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
        removeCookie("email_otp_until")
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
        removeCookie("business_mobile_otp_until")
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

  const handleResendInlineOtp = async () => {
    if (otpResending) return

    try {
      setOtpResending(true)
      setOtpError("")

      if (otpModalType === "email") {
        if (emailCooldown > 0) return
        const email = form.businessEmail.trim()
        await sendEmailOtp({ email, purpose: PURPOSE_BUSINESS_EMAIL_VERIFY })
        const until = Date.now() + 60 * 1000
        setCookie("email_otp_until", String(until), { maxAge: 60, path: "/" })
        setEmailCooldown(60)
      } else if (otpModalType === "mobile") {
        if (mobileCooldown > 0) return
        await sendOtp({ via: "whatsapp" })
        const until = Date.now() + 60 * 1000
        setCookie("business_mobile_otp_until", String(until), { maxAge: 60, path: "/" })
        setMobileCooldown(60)
      }
    } catch (err) {
      setOtpError(getErrorMessage(err, "Failed to resend OTP"))
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
    if (!(await ensureAccessToken())) {
      setSubmitError("Session expired. Please login again.")
      router.replace("/auth/login")
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
    if (!(await ensureAccessToken())) {
      setSubmitError("Session expired. Please login again.")
      router.replace("/auth/login")
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
    const businessType = form.businessType
    const placeId = form.placeId.trim()
    const primaryNumber = form.primaryNumber.trim()
    const businessEmail = form.businessEmail.trim()
    const pan = form.pan.trim().toUpperCase()
    const gstin = form.gstin.trim().toUpperCase()

    if (!businessName) {
      setSubmitError("Business name is required")
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
    if (!(await ensureAccessToken())) {
      setSubmitError("Session expired. Please login again.")
      router.replace("/auth/login")
      return
    }

    setSubmitting(true)
    setSubmitError("")

    try {
      const response = await registerBusiness({
        business_name: businessName,
        display_name: normalizeBusinessLabel(form.displayName?.trim() || businessName),
        main_category_id: resolvedMainCategoryId,
        business_type: Number(form.businessType),
        seaneb_id: form.seanebId.trim(),
        primary_number: primaryNumber,
        whatsapp_number: form.whatsappNumber.trim() || primaryNumber,
        business_email: businessEmail || undefined,
        about_branch: form.aboutBranch.trim() || "Head office branch",
        address: form.businessLocation.trim(),
        landmark: form.landmark.trim(),
        place_id: placeId,
        pan,
        gstin,
        product_key: lockedProductKey,
      })

      const data = response?.data || response || {}
      const businessId = data?.business_id || data?.id || ""
      const createdBranchId = String(data?.branch_id || data?.default_branch_id || "")
      setBranchId(createdBranchId)

      // Auto-verify PAN/GST after branch creation when user has already entered values.
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
      router.replace("/dashboard/broker")
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Registration failed"))
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  return (
    <AuthCard1 header={<AuthHeader language={language} setLanguage={setLanguage} />}>
      <div className="business-register-shell">
        <div className="business-register-top">
          <div className="business-register-header">
            <h1 className="business-register-title">Register Your Business</h1>
            <p className="business-register-subtitle">Set up your branch profile to start listing and managing leads.</p>
          </div>
          <div className="business-register-progress">
            <div className="business-register-progress-meta">
              <span>Form completion</span>
              <strong>{completionPercent}%</strong>
            </div>
            <div className="business-register-progress-track">
              <span style={{ width: `${completionPercent}%` }} />
            </div>
          </div>

          <div className="business-status-grid">
            <div className={`business-status-pill ${mobileVerified ? "verified" : ""}`}>
              <span>Mobile</span>
              <strong>{mobileVerified ? "Verified" : "Pending"}</strong>
            </div>
            <div className={`business-status-pill ${emailVerified ? "verified" : ""}`}>
              <span>Email</span>
              <strong>{form.businessEmail.trim() ? (emailVerified ? "Verified" : "Optional") : "Optional"}</strong>
            </div>
            <div className={`business-status-pill ${form.placeId ? "verified" : ""}`}>
              <span>Location</span>
              <strong>{form.placeId ? "Selected" : "Pending"}</strong>
            </div>
            <div className={`business-status-pill ${branchId ? "verified" : ""}`}>
              <span>Branch</span>
              <strong>{branchId ? "Created" : "New"}</strong>
            </div>
          </div>
        </div>

        {submitError && (
          <div className="business-form-error">
            <p className="business-form-error-text">{submitError}</p>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="business-form business-form--pro">
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

              <Field label="Display Name">
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

          <section className="business-section-card">
            <div className="business-section-head">
              <h2>Contact Details</h2>
              <p>Numbers and email used for branch communication and verification.</p>
            </div>
            <div className="business-grid business-grid--2">
              <Field label="Primary Number *">
                <div className="business-inline-action">
                  <input
                    type="text"
                    className={`business-form-input ${mobileVerified ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={form.primaryNumber}
                    onChange={(e) => setField("primaryNumber", e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    type="button"
                    onClick={handleMobileVerify}
                    disabled={!form.primaryNumber.trim() || mobileVerified || mobileLoading}
                    className="h-11 min-w-[110px] rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {mobileLoading ? "Sending..." : mobileVerified ? "Verified" : mobileCooldown > 0 ? "Enter OTP" : "Verify"}
                  </button>
                </div>
              </Field>

              <Field label="WhatsApp Number">
                <input type="text" className="business-form-input" value={form.whatsappNumber} onChange={(e) => setField("whatsappNumber", e.target.value.replace(/\D/g, ""))} />
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
                    onClick={handleEmailVerify}
                    disabled={!form.businessEmail.trim() || emailVerified || emailLoading}
                    className="h-11 min-w-[110px] rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {emailLoading ? "Sending..." : emailVerified ? "Verified" : emailCooldown > 0 ? "Enter OTP" : "Verify"}
                  </button>
                </div>
              </Field>
            </div>
          </section>

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

          <div className="business-submit-panel">
            <div className="checkbox-row">
              <input type="checkbox" id="agree" checked={form.agree} onChange={(e) => setField("agree", e.target.checked)} />
              <label htmlFor="agree" className="text-sm cursor-pointer">I agree to the business terms and conditions</label>
            </div>
            <Button label={submitting ? (t.loading || "Registering...") : "Register Business"} disabled={submitting} onClick={handleSubmit} />
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
        cooldown={otpModalType === "email" ? emailCooldown : mobileCooldown}
        error={otpError}
        clearSignal={otpClearSignal}
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
