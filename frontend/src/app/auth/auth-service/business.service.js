import api, { authApi } from "@/lib/api/client"
import { getDefaultProductKey, getDefaultProductName } from "@/services/dashboard.service"
import { bootstrapProductAuth } from "@/app/auth/auth-service/auth.bootstrap"
import { getAccessToken } from "@/lib/auth/tokenStorage"
import {
  cleanPayload,
  getErrorCode,
  getErrorStatus,
  getErrorText,
  limitText,
  pickErrorMessage,
  pickFirst,
  toNumberOr,
  toText,
  toUpper,
} from "@/app/auth/auth-service/service.utils"

const businessApi = authApi

const isAuthError = (err) => {
  const status = getErrorStatus(err)
  const code = getErrorCode(err)
  const message = getErrorText(err)

  if (status === 401 || status === 403) return true
  if (code.includes("auth") || code.includes("token") || code.includes("csrf")) return true
  return message.includes("unauthorized") || message.includes("token") || message.includes("csrf")
}

const isProductError = (err) => {
  const status = getErrorStatus(err)
  const code = getErrorCode(err)
  const message = getErrorText(err)

  if (code.includes("product")) return true
  if (message.includes("invalid or inactive product") || message.includes("product not found")) return true
  return status === 404 && message.includes("product")
}

const parseBusinessList = (body) => {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.businesses)) return body.businesses
  if (Array.isArray(body?.data?.businesses)) return body.data.businesses
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.result)) return body.result
  return []
}

const ENV_PRODUCT_KEY = "property"

const getProductKeys = () => {
  const preferred = toText(getDefaultProductKey())
  return [...new Set([preferred, ENV_PRODUCT_KEY, "property"].filter(Boolean))]
}

const getAuthHeaders = ({ includeProductKey = false, productKey } = {}) => {
  const headers = {}
  const token = getAccessToken()
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  
  if (includeProductKey) {
    headers["x-product-key"] = toText(productKey || getDefaultProductKey())
  }

  return headers
}

const ensureBusinessProductContext = async () => {
  try {
    await api.post("/products", {
      product_key: toText(getDefaultProductKey()),
      product_name: getDefaultProductName(),
    })
  } catch (err) {
    if (getErrorStatus(err) !== 409) {
      console.warn("[business.service] product context setup failed:", err?.response?.data || err?.message || err)
    }
  }
}

const withRecovery = async (requestFn) => {
  try {
    return await requestFn()
  } catch (err) {
    if (isAuthError(err)) {
      const recovered = await bootstrapProductAuth({ force: true })
      if (!recovered) throw err
      return requestFn()
    }

    if (isProductError(err)) {
      await ensureBusinessProductContext()
      return requestFn()
    }

    throw err
  }
}

export const getBusinessAutocomplete = async (input) => {
  const query = toText(input)
  if (query.length < 2) return []

  let lastError = null
  let lastList = []

  for (const productKey of getProductKeys()) {
    try {
      const res = await withRecovery(() =>
        businessApi.get("/v1/business/autocomplete", {
          params: { input: query },
          headers: getAuthHeaders({ includeProductKey: true, productKey }),
        })
      )

      const list = parseBusinessList(res?.data)
      if (list.length > 0) return list
      lastList = list
      continue
    } catch (err) {
      lastError = err

      if (isAuthError(err)) {
        try {
          const publicRes = await api.get("/v1/business/autocomplete", {
            params: { input: query },
            headers: { "x-product-key": productKey },
          })
          const publicList = parseBusinessList(publicRes?.data)
          if (publicList.length > 0) return publicList
          lastList = publicList
          continue
        } catch (publicErr) {
          lastError = publicErr
        }
      }

      if (!isProductError(err)) break
    }
  }

  if (lastList.length > 0) return lastList
  if (lastError) {
    console.error("[business.service] getBusinessAutocomplete failed:", lastError?.response?.data || lastError?.message || lastError)
  }
  return []
}

export const registerBusiness = async (data = {}) => {
  const businessName = limitText(pickFirst(data.business_name, data.businessName), 30)
  const businessType = pickFirst(data.business_type, data.businessType)
  const placeId = toText(pickFirst(data.place_id, data.placeId))
  const productKey = toText(getDefaultProductKey())

  if (!businessName) return Promise.reject(new Error("Business name is required"))
  if (businessType === "") return Promise.reject(new Error("Business type is required"))
  if (!placeId) return Promise.reject(new Error("Business location is required"))

  const payload = cleanPayload({
    business_name: businessName,
    display_name: limitText(pickFirst(data.display_name, data.displayName, businessName), 30),
    main_category_id: toText(pickFirst(data.main_category_id, data.mainCategoryId)),
    business_type: Number.isNaN(Number(businessType)) ? businessType : Number(businessType),
    seaneb_id: toText(pickFirst(data.seaneb_id, data.seanebId)),
    primary_number: toText(pickFirst(data.primary_number, data.primaryNumber)),
    whatsapp_number: toText(pickFirst(data.whatsapp_number, data.whatsappNumber)),
    business_email: toText(pickFirst(data.business_email, data.businessEmail)),
    about_branch: toText(pickFirst(data.about_branch, data.aboutBranch, "Head office branch")),
    address: toText(pickFirst(data.address, data.business_location, data.businessLocation)),
    landmark: toText(data.landmark),
    place_id: placeId,
    latitude: toNumberOr(data.latitude, 0),
    longitude: toNumberOr(data.longitude, 0),
    product_key: productKey,
  })

  const pan = toUpper(pickFirst(data.pan_number, data.pan))
  const gstin = toUpper(pickFirst(data.gstin, data.gst?.gstin))
  if (pan) payload.pan = { pan_number: pan }
  if (gstin) payload.gst = { gstin }

  try {
    return await withRecovery(() =>
      businessApi.post("/v1/business/create", payload, {
        headers: getAuthHeaders({ includeProductKey: true, productKey }),
      })
    )
  } catch (err) {
    const status = getErrorStatus(err)
    if (status === 404 || status === 405) {
      return withRecovery(() =>
        businessApi.post("/v1/business/create", payload, {
          headers: getAuthHeaders({ includeProductKey: true, productKey }),
        })
      )
    }
    throw err
  }
}

export const createBusinessBranch = async (data = {}) => {
  const businessId = toText(pickFirst(data.business_id, data.businessId))
  const placeId = toText(pickFirst(data.place_id, data.placeId))

  if (!businessId) return Promise.reject(new Error("business_id is required"))
  if (!placeId) return Promise.reject(new Error("place_id is required"))

  const payload = cleanPayload({
    business_id: businessId,
    seaneb_id: toText(pickFirst(data.seaneb_id, data.seanebId)),
    primary_number: toText(pickFirst(data.primary_number, data.primaryNumber)),
    whatsapp_number: toText(pickFirst(data.whatsapp_number, data.whatsappNumber)),
    business_email: toText(pickFirst(data.business_email, data.businessEmail)),
    about_branch: toText(pickFirst(data.about_branch, data.aboutBranch)),
    address: toText(data.address),
    landmark: toText(data.landmark),
    place_id: placeId,
    product_key: toText(getDefaultProductKey()),
  })

  const pan = toUpper(data.pan)
  const gstin = toUpper(data.gstin)
  if (pan) payload.pan = { pan_number: pan }
  if (gstin) payload.gst = { gstin }

  return withRecovery(() =>
    businessApi.post("/v1/business/create-branch", payload, {
      headers: getAuthHeaders({ includeProductKey: true }),
    })
  )
}

export const verifyPanForBranch = async ({ pan, branch_id }) => {
  const finalPan = toUpper(pan)
  const branchId = toText(branch_id)

  if (!finalPan) return Promise.reject(new Error("PAN is required"))
  if (!branchId) return Promise.reject(new Error("branch_id is required for PAN verification"))

  try {
    return await withRecovery(() =>
      businessApi.post(
        "/v1/verification/verify-pan",
        {
          pan: finalPan,
          branch_id: branchId,
          product_key: toText(getDefaultProductKey()),
        },
        { headers: getAuthHeaders({ includeProductKey: true }) }
      )
    )
  } catch (err) {
    throw new Error(pickErrorMessage(err, "PAN verification failed"))
  }
}

export const verifyGstForBranch = async ({ gstin, branch_id }) => {
  const finalGstin = toUpper(gstin)
  const branchId = toText(branch_id)

  if (!finalGstin) return Promise.reject(new Error("GSTIN is required"))
  if (!branchId) return Promise.reject(new Error("branch_id is required for GST verification"))

  try {
    return await withRecovery(() =>
      businessApi.post(
        "/v1/verification/verify-gst",
        {
          gstin: finalGstin,
          branch_id: branchId,
          product_key: toText(getDefaultProductKey()),
        },
        { headers: getAuthHeaders({ includeProductKey: true }) }
      )
    )
  } catch (err) {
    throw new Error(pickErrorMessage(err, "GST verification failed"))
  }
}

export const getBusinessDetails = async (businessId) => {
  if (!businessId) return Promise.reject(new Error("Business ID is required"))
  return businessApi.get(`/v1/business/${businessId}`)
}

export const updateBusiness = async (businessId, data = {}) => {
  if (!businessId) return Promise.reject(new Error("Business ID is required"))

  const payload = cleanPayload({
    business_name: pickFirst(data.business_name, data.businessName),
    business_type: pickFirst(data.business_type, data.businessType),
    business_description: pickFirst(data.business_description, data.businessDescription),
    registration_number: pickFirst(data.registration_number, data.registrationNumber),
  })

  return businessApi.put(`/v1/business/${businessId}`, payload)
}

export const getBusinessList = async () => businessApi.get("/v1/business/list")

export const deleteBusiness = async (businessId) => {
  if (!businessId) return Promise.reject(new Error("Business ID is required"))
  return businessApi.delete(`/v1/business/${businessId}`)
}



