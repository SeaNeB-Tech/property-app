const DEVICE_ID_STORAGE_KEY = "device_id"

const generateDeviceId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `device_${timestamp}_${random}`
}

export const getStoredDeviceId = () => {
  if (typeof window === "undefined") return ""
  try {
    return String(window.localStorage.getItem(DEVICE_ID_STORAGE_KEY) || "").trim()
  } catch {
    return ""
  }
}

export const ensureDeviceId = () => {
  if (typeof window === "undefined") return ""
  let deviceId = getStoredDeviceId()
  if (!deviceId) {
    deviceId = generateDeviceId()
    try {
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId)
    } catch {
      // ignore storage errors
    }
  }
  return deviceId
}

export const setStoredDeviceId = (value) => {
  if (typeof window === "undefined") return ""
  const nextValue = String(value || "").trim()
  if (!nextValue) return ""
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextValue)
  } catch {
    // ignore storage errors
  }
  return nextValue
}
