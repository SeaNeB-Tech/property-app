import api from "@/services/api"
import { authStore } from "@/app/auth/auth-service/store/authStore"
import { refreshAccessToken } from "@/app/auth/auth-service/authservice"
import { getDefaultProductKey, getDefaultProductName } from "@/services/pro.service"
import { bootstrapProductAuth } from "@/app/auth/auth-service/auth.bootstrap"

const businessApi = api

const parseErrorMessage = (err, fallback) =>
  err?.response?.data?.error?.message ||
  err?.response?.data?.message ||
  err?.message ||
  fallback

const limitText = (value, max) => String(value || "").trim().slice(0, max)

const getProductKeyCandidates = () => {
  const preferred = String(getDefaultProductKey() || "").trim()
  const candidates = [preferred, "property", "seaneb"]
  return [...new Set(candidates.filter(Boolean))]
}

const isInvalidOrInactiveProductError = (err) => {
  const status = Number(err?.response?.status || 0)
  const code = String(err?.response?.data?.error?.code || "").toUpperCase()
  const message = String(
    err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      ""
  ).toLowerCase()

  if (code.includes("PRODUCT")) return true
  if (message.includes("invalid or inactive product")) return true
  if (message.includes("product not found")) return true
  return status === 404 && message.includes("product")
}

const isCsrfRequiredError = (err) => {
  const status = Number(err?.response?.status || 0)
  const code = String(err?.response?.data?.error?.code || "").toUpperCase()
  const message = String(
    err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      ""
  ).toLowerCase()

  return (
    status === 403 &&
    (code.includes("CSRF") || message.includes("csrf token is required") || message.includes("csrf"))
  )
}

const isAuthRelatedError = (err) => {
  const status = Number(err?.response?.status || 0)
  const code = String(err?.response?.data?.error?.code || "").toUpperCase()
  const message = String(
    err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      ""
  ).toLowerCase()

  if (status === 401 || status === 403) return true
  if (code.includes("AUTH") || code.includes("TOKEN") || code.includes("CSRF")) return true
  return message.includes("unauthorized") || message.includes("token") || message.includes("csrf")
}

const ensureBusinessProductContext = async () => {
  const productKey = getDefaultProductKey()
  try {
    await api.post("/products", {
      product_key: productKey,
      product_name: getDefaultProductName(),
    })
  } catch (err) {
    // 409 means product already exists, so treat as success
    if (err?.response?.status !== 409) {
      console.warn("[business.service] ensure product create failed:", err?.response?.data || err?.message || err)
    }
  }
}

const withBusinessRecovery = async (requestFn) => {
  try {
    return await requestFn()
  } catch (err) {
    const status = Number(err?.response?.status || 0)

    // Access token expired in business flow: refresh and retry once.
    if (status === 401) {
      try {
        await refreshAccessToken()
        return requestFn()
      } catch (refreshErr) {
        try {
          // Token may exist in memory but still be invalid (401), so force full bootstrap.
          await bootstrapProductAuth({ force: true })
        } catch (bootstrapErr) {
          const fallbackErr =
            isCsrfRequiredError(refreshErr) || String(refreshErr?.message || "").toLowerCase().includes("refresh")
              ? bootstrapErr
              : refreshErr
          throw new Error(parseErrorMessage(fallbackErr, "Session expired. Please login again."))
        }

        if (authStore.getAccessToken()) {
          return requestFn()
        }

        throw new Error("Session expired. Please login again.")
      }
    }

    // Product context mismatch: ensure product exists, refresh token context, retry once.
    if (isInvalidOrInactiveProductError(err)) {
      await ensureBusinessProductContext()
      return requestFn()
    }

    throw err
  }
}

/**
 * Business name autocomplete
 * GET /api/v1/business/autocomplete
 * Required:
 * - header: x-product-key
 * - query: input (min 2 chars)
 */
export const getBusinessAutocomplete = async (input) => {
  const query = String(input || "").trim()
  if (query.length < 2) return []

  try {
    const productKeys = getProductKeyCandidates()
    let lastError = null
    let lastSuccessfulList = null

    for (const productKey of productKeys) {
      try {
        const makeAuthedRequest = () =>
          businessApi.get("/business/autocomplete", {
            params: { input: query },
            headers: {
              ...getAuthHeaders(),
              "x-product-key": productKey,
            },
          })

        const res = await withBusinessRecovery(makeAuthedRequest)
        const body = res?.data
        const list =
          Array.isArray(body)
            ? body
            : body?.businesses ||
              body?.data?.businesses ||
              body?.data ||
              body?.result ||
              []
        const normalizedList = Array.isArray(list) ? list : []

        // Try the next product key if current key returns no suggestions.
        if (normalizedList.length > 0) {
          return normalizedList
        }

        lastSuccessfulList = normalizedList
      } catch (err) {
        lastError = err

        // If auth refresh/bootstrap fails, retry this endpoint as product-key-only.
        // Docs require input + x-product-key, and a stale Authorization header can trigger 401s.
        if (isAuthRelatedError(err)) {
          try {
            const publicRes = await businessApi.get("/business/autocomplete", {
              params: { input: query },
              headers: {
                "x-product-key": productKey,
              },
            })

            const publicBody = publicRes?.data
            const publicList =
              Array.isArray(publicBody)
                ? publicBody
                : publicBody?.businesses ||
                  publicBody?.data?.businesses ||
                  publicBody?.data ||
                  publicBody?.result ||
                  []
            const normalizedPublicList = Array.isArray(publicList) ? publicList : []

            if (normalizedPublicList.length > 0) {
              return normalizedPublicList
            }

            lastSuccessfulList = normalizedPublicList
            continue
          } catch (publicErr) {
            lastError = publicErr
          }
        }

        if (!isInvalidOrInactiveProductError(err)) {
          throw err
        }
      }
    }

    if (Array.isArray(lastSuccessfulList)) {
      return lastSuccessfulList
    }

    throw lastError || new Error("Business autocomplete failed")
  } catch (err) {
    console.error("[business.service] getBusinessAutocomplete failed:", err?.response?.data || err?.message || err)
    return []
  }
}

const getAuthHeaders = ({ includeProductKey = false, productKey } = {}) => {
  const headers = {}
  const token = authStore.getAccessToken()
  const csrf = authStore.getCsrfToken()

  if (token) headers.Authorization = `Bearer ${token}`
  if (csrf) headers["x-csrf-token"] = csrf
  if (includeProductKey) headers["x-product-key"] = String(productKey || getDefaultProductKey()).trim()

  return headers
}

/**
 * Register a business for a user
 * POST /api/v1/business/create
 * Schema aligned with API docs screenshot (flat address + branch fields)
 */
export const registerBusiness = async (data = {}) => {
  const {
    business_name,
    businessName,
    display_name,
    displayName,
    main_category_id,
    mainCategoryId,
    business_type,
    businessType,
    seaneb_id,
    seanebId,
    primary_number,
    primaryNumber,
    whatsapp_number,
    whatsappNumber,
    business_email,
    businessEmail,
    about_branch,
    aboutBranch,
    address,
    business_location,
    businessLocation,
    landmark,
    place_id,
    placeId,
    latitude,
    longitude,
    pan,
    pan_number,
    gst,
    gstin,
    product_key,
    productKey,
  } = data

  const finalBusinessName = limitText(business_name ?? businessName ?? "", 30)
  const finalBusinessType = business_type ?? businessType
  const finalPlaceId = String(place_id ?? placeId ?? "").trim()

  if (!finalBusinessName) {
    return Promise.reject(new Error("Business name is required"))
  }

  if (finalBusinessType === undefined || finalBusinessType === null || finalBusinessType === "") {
    return Promise.reject(new Error("Business type is required"))
  }

  if (!finalPlaceId) {
    return Promise.reject(new Error("Business location is required"))
  }

  const effectiveProductKey = String(product_key || productKey || getDefaultProductKey()).trim()

  const payload = {
    business_name: finalBusinessName,
    display_name: limitText(display_name || displayName || finalBusinessName, 30),
    main_category_id: (main_category_id || mainCategoryId || "").trim(),
    business_type: Number.isNaN(Number(finalBusinessType)) ? finalBusinessType : Number(finalBusinessType),
    seaneb_id: (seaneb_id || seanebId || "").trim(),
    primary_number: String(primary_number || primaryNumber || "").trim(),
    whatsapp_number: String(whatsapp_number || whatsappNumber || "").trim(),
    business_email: String(business_email || businessEmail || "").trim(),
    about_branch: (about_branch || aboutBranch || "Head office branch").trim(),
    address: (address || business_location || businessLocation || "").trim(),
    landmark: String(landmark || "").trim(),
    place_id: finalPlaceId,
    latitude: latitude !== undefined && latitude !== null && latitude !== "" ? Number(latitude) : 0,
    longitude: longitude !== undefined && longitude !== null && longitude !== "" ? Number(longitude) : 0,
    product_key: effectiveProductKey,
  }

  const finalPan = String(pan_number || pan || "").trim().toUpperCase()
  if (finalPan) payload.pan = { pan_number: finalPan }

  const finalGst = String(gstin || gst?.gstin || "").trim().toUpperCase()
  if (finalGst) payload.gst = { gstin: finalGst }

  // Remove empty optional fields to match backend validation expectations
  Object.keys(payload).forEach((key) => {
    if (payload[key] === "") delete payload[key]
  })

  console.log("registerBusiness payload:", JSON.stringify(payload, null, 2))

  try {
    const makeCreate = () =>
      businessApi.post("/business/create", payload, {
        headers: getAuthHeaders({ includeProductKey: true, productKey: effectiveProductKey }),
      })
    return await withBusinessRecovery(makeCreate)
  } catch (err) {
    const status = err?.response?.status
    if (status === 404 || status === 405) {
      console.warn("[business.service] /business/create unavailable, falling back to /business/register")
      const makeRegister = () =>
        businessApi.post("/business/register", payload, {
          headers: getAuthHeaders({ includeProductKey: true, productKey: effectiveProductKey }),
        })
      return await withBusinessRecovery(makeRegister)
    }
    throw err
  }
}

/**
 * Create a branch under existing business
 * POST /api/v1/business/create-branch
 */
export const createBusinessBranch = async (data = {}) => {
  const {
    business_id,
    businessId,
    seaneb_id,
    seanebId,
    primary_number,
    primaryNumber,
    whatsapp_number,
    whatsappNumber,
    business_email,
    businessEmail,
    about_branch,
    aboutBranch,
    address,
    landmark,
    place_id,
    placeId,
    pan,
    gstin,
  } = data

  const finalBusinessId = String(business_id ?? businessId ?? "").trim()
  const finalPlaceId = String(place_id ?? placeId ?? "").trim()

  if (!finalBusinessId) {
    return Promise.reject(new Error("business_id is required"))
  }

  if (!finalPlaceId) {
    return Promise.reject(new Error("place_id is required"))
  }

  const payload = {
    business_id: finalBusinessId,
    seaneb_id: String(seaneb_id || seanebId || "").trim(),
    primary_number: String(primary_number || primaryNumber || "").trim(),
    whatsapp_number: String(whatsapp_number || whatsappNumber || "").trim(),
    business_email: String(business_email || businessEmail || "").trim(),
    about_branch: String(about_branch || aboutBranch || "").trim(),
    address: String(address || "").trim(),
    landmark: String(landmark || "").trim(),
    place_id: finalPlaceId,
    pan: {
      pan_number: String(pan || "").trim().toUpperCase(),
    },
    gst: {
      gstin: String(gstin || "").trim().toUpperCase(),
    },
    product_key: getDefaultProductKey(),
  }

  const makeRequest = () =>
    businessApi.post("/business/create-branch", payload, {
      headers: getAuthHeaders({ includeProductKey: true }),
    })

  return withBusinessRecovery(makeRequest)
}

/**
 * Verify PAN for a branch
 * POST /api/v1/verification/verify-pan
 */
export const verifyPanForBranch = async ({ pan, branch_id }) => {
  if (!pan) {
    return Promise.reject(new Error("PAN is required"))
  }

  if (!branch_id) {
    return Promise.reject(new Error("branch_id is required for PAN verification"))
  }

  try {
    const makeRequest = () =>
      businessApi.post(
        "/verification/verify-pan",
        {
          pan: String(pan).trim().toUpperCase(),
          branch_id: String(branch_id),
          product_key: getDefaultProductKey(),
        },
        { headers: getAuthHeaders({ includeProductKey: true }) }
      )

    return await withBusinessRecovery(makeRequest)
  } catch (err) {
    throw new Error(parseErrorMessage(err, "PAN verification failed"))
  }
}

/**
 * Verify GST for a branch
 * POST /api/v1/verification/verify-gst
 */
export const verifyGstForBranch = async ({ gstin, branch_id }) => {
  if (!gstin) {
    return Promise.reject(new Error("GSTIN is required"))
  }

  if (!branch_id) {
    return Promise.reject(new Error("branch_id is required for GST verification"))
  }

  try {
    const makeRequest = () =>
      businessApi.post(
        "/verification/verify-gst",
        {
          gstin: String(gstin).trim().toUpperCase(),
          branch_id: String(branch_id),
          product_key: getDefaultProductKey(),
        },
        { headers: getAuthHeaders({ includeProductKey: true }) }
      )

    return await withBusinessRecovery(makeRequest)
  } catch (err) {
    throw new Error(parseErrorMessage(err, "GST verification failed"))
  }
}

/**
 * Get business details
 * GET /business/:id
 */
export const getBusinessDetails = async (businessId) => {
  if (!businessId) {
    return Promise.reject(new Error("Business ID is required"))
  }

  console.log(`[business.service] Fetching business details for ID: ${businessId}`)
  return api.get(`/business/${businessId}`)
}

/**
 * Update business information
 * PUT /business/:id
 */
export const updateBusiness = async (businessId, data = {}) => {
  if (!businessId) {
    return Promise.reject(new Error("Business ID is required"))
  }

  const payload = {
    business_name: data.business_name || data.businessName,
    business_type: data.business_type || data.businessType,
    business_description: data.business_description || data.businessDescription,
    registration_number: data.registration_number || data.registrationNumber,
  }

  console.log(
    `[business.service] Updating business ${businessId}:`,
    JSON.stringify(payload, null, 2)
  )
  return api.put(`/business/${businessId}`, payload)
}

/**
 * Get user's business list
 * GET /business/list
 */
export const getBusinessList = async () => {
  console.log("[business.service] Fetching user's business list")
  return api.get("/business/list")
}

/**
 * Delete a business
 * DELETE /business/:id
 */
export const deleteBusiness = async (businessId) => {
  if (!businessId) {
    return Promise.reject(new Error("Business ID is required"))
  }

  console.log(`[business.service] Deleting business ${businessId}`)
  return api.delete(`/business/${businessId}`)
}
