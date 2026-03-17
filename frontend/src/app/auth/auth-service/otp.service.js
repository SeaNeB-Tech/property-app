import api, { hydrateAuthSession } from "@/lib/api/client";
import { authStore } from "./store/authStore";
import {
  getDefaultProductKey,
  getDefaultProductName,
} from "@/services/dashboard.service";
import {
  clearAuthFailureArtifacts,
  getJsonCookie,
  setJsonCookie,
  shouldClearAuthOnError,
} from "@/services/auth.service";
import {
  getErrorStatus,
  getErrorText,
  pickFirst,
  toText,
} from "@/app/auth/auth-service/service.utils";

const IDENTIFIER_TYPE_MOBILE = 0;
const PURPOSE_SIGNUP_OR_LOGIN = 0;

const DEFAULT_VIA = "whatsapp";
const FALLBACK_VIA = "sms";

const OTP_SEND_PATHS = ["/otp/send-otp"];
const OTP_VERIFY_PATHS = ["/auth/verify-otp", "/otp/verify-otp"];

const OTP_DEFAULT_COOLDOWN_SECONDS = 60;
const OTP_ALREADY_SENT_CODE = "OTP_ALREADY_SENT";
const OTP_STORAGE_PREFIX = "property:otp:v1:";
const OTP_COOLDOWN_KEY_PREFIX = `${OTP_STORAGE_PREFIX}cooldown:`;
const OTP_LOCK_KEY_PREFIX = `${OTP_STORAGE_PREFIX}lock:`;
const OTP_TAB_ID_KEY = `${OTP_STORAGE_PREFIX}tab-id`;
const OTP_LOCK_TTL_MS = 10 * 1000;

const OtpSendThrottle = {
  key: "",
  promise: null,
};

const safeJsonParse = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getLocalStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
};

const getSessionStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
};

const getTabId = () => {
  const storage = getSessionStorage();
  if (!storage) return `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  try {
    const existing = storage.getItem(OTP_TAB_ID_KEY);
    if (existing) return existing;
    const next = `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    storage.setItem(OTP_TAB_ID_KEY, next);
    return next;
  } catch {
    return `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
};

const buildOtpKey = ({ country_code, mobile_number, purpose }) =>
  `${String(country_code || "").trim()}|${String(mobile_number || "").trim()}|${String(purpose ?? "").trim()}`;

const getCooldownStorageKey = (otpKey) => `${OTP_COOLDOWN_KEY_PREFIX}${otpKey}`;
const getLockStorageKey = (otpKey) => `${OTP_LOCK_KEY_PREFIX}${otpKey}`;

const readCooldown = (otpKey) => {
  const storage = getLocalStorage();
  if (!storage || !otpKey) return null;

  const parsed = safeJsonParse(storage.getItem(getCooldownStorageKey(otpKey)));
  if (!parsed || typeof parsed !== "object") return null;

  const until = Number(parsed.until || 0);
  if (!Number.isFinite(until) || until <= 0) return null;

  return {
    until,
    waitSeconds: Number(parsed.waitSeconds || 0),
    message: String(parsed.message || "").trim(),
    code: String(parsed.code || "").trim(),
    kind: String(parsed.kind || "").trim(),
  };
};

const writeCooldown = (otpKey, { waitSeconds, message, code, kind } = {}) => {
  const storage = getLocalStorage();
  if (!storage || !otpKey) return;

  const safeWait = Math.max(1, Number(waitSeconds) || OTP_DEFAULT_COOLDOWN_SECONDS);
  const payload = {
    until: Date.now() + safeWait * 1000,
    waitSeconds: safeWait,
    message: String(message || "").trim(),
    code: String(code || "").trim(),
    kind: String(kind || "").trim(),
    updatedAt: Date.now(),
  };

  try {
    storage.setItem(getCooldownStorageKey(otpKey), JSON.stringify(payload));
  } catch {
    // ignore
  }
};

const getRemainingSeconds = (otpKey) => {
  const record = readCooldown(otpKey);
  if (!record) return 0;

  const remainingMs = record.until - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / 1000));
};

const buildBackendLikeThrottleError = (otpKey, fallbackMessage) => {
  const record = readCooldown(otpKey);
  const remainingSeconds = getRemainingSeconds(otpKey);

  // Only show messages that came from backend. If we only know "OTP was sent",
  // we block silently (button stays as-is) instead of inventing a message.
  const isThrottleRecord = String(record?.kind || "").toLowerCase() === "throttled";
  const message = isThrottleRecord
    ? String(record?.message || "").trim() || String(fallbackMessage || "").trim()
    : String(fallbackMessage || "").trim();
  const code = String(record?.code || "").trim() || OTP_ALREADY_SENT_CODE;

  const err = new Error(message);
  err.response = {
    status: 429,
    data: {
      code,
      message,
      wait_seconds: remainingSeconds || Math.max(1, Number(record?.waitSeconds || 1)),
    },
  };
  return err;
};

const readLock = (otpKey) => {
  const storage = getLocalStorage();
  if (!storage || !otpKey) return null;

  const parsed = safeJsonParse(storage.getItem(getLockStorageKey(otpKey)));
  if (!parsed || typeof parsed !== "object") return null;

  const owner = String(parsed.owner || "").trim();
  const expiresAt = Number(parsed.expiresAt || 0);

  if (!owner || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  if (Date.now() > expiresAt) {
    try {
      storage.removeItem(getLockStorageKey(otpKey));
    } catch {
      // ignore
    }
    return null;
  }

  return { owner, expiresAt };
};

const tryAcquireLock = (otpKey) => {
  const storage = getLocalStorage();
  if (!otpKey) return "";
  // If localStorage is unavailable, skip cross-tab locking (still prevents double-click in the same tab).
  if (!storage) return "no-storage";

  const owner = getTabId();
  const existing = readLock(otpKey);
  if (existing && existing.owner && existing.owner !== owner) return "";

  try {
    storage.setItem(
      getLockStorageKey(otpKey),
      JSON.stringify({
        owner,
        createdAt: Date.now(),
        expiresAt: Date.now() + OTP_LOCK_TTL_MS,
      })
    );
  } catch {
    return "";
  }

  const confirmed = readLock(otpKey);
  if (confirmed?.owner === owner) return owner;
  return "";
};

const releaseLock = (otpKey, owner) => {
  const storage = getLocalStorage();
  if (!storage || !otpKey || !owner || owner === "no-storage") return;

  const current = readLock(otpKey);
  if (!current || current.owner !== owner) return;

  try {
    storage.removeItem(getLockStorageKey(otpKey));
  } catch {
    // ignore
  }
};

const readBackendWaitSeconds = (source) => {
  const data = source?.response?.data || source?.data || {};
  const seconds = Number(
    data?.wait_seconds ||
      data?.waitSeconds ||
      data?.retry_after ||
      data?.retryAfter ||
      data?.error?.wait_seconds ||
      data?.error?.waitSeconds ||
      data?.error?.retry_after ||
      data?.error?.retryAfter ||
      0
  );
  if (Number.isFinite(seconds) && seconds > 0) return seconds;

  const header =
    source?.response?.headers?.["retry-after"] ||
    source?.response?.headers?.["Retry-After"] ||
    source?.headers?.["retry-after"] ||
    source?.headers?.["Retry-After"];
  const parsed = Number(header);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const readBackendCode = (source) => {
  const data = source?.response?.data || source?.data || {};
  return String(data?.code || data?.error?.code || "").trim().toUpperCase();
};

const readBackendMessage = (source) => {
  const data = source?.response?.data || source?.data || {};
  return String(data?.message || data?.error?.message || "").trim();
};

/* --------------------------------------------------
   ERROR HELPERS
-------------------------------------------------- */

const isProductNotFoundError = (err) =>
  getErrorStatus(err) === 404 && getErrorText(err).includes("product not found");

/* --------------------------------------------------
   PRODUCT ENSURE
-------------------------------------------------- */

const ensureLoginProduct = async () => {
  try {
    await api.post(
      "/products",
      {
        product_key: getDefaultProductKey(),
        product_name: getDefaultProductName(),
      },
      { requireAuth: false }
    );

    return true;
  } catch (err) {
    return getErrorStatus(err) === 409;
  }
};

/* --------------------------------------------------
   OTP CONTEXT
-------------------------------------------------- */

const getOtpContext = () => {
  const ctx = getJsonCookie("otp_context");

  if (!ctx) {
    throw new Error("OTP context missing");
  }

  if (!ctx.country_code || !ctx.mobile_number) {
    throw new Error(
      "Invalid OTP context - missing country_code or mobile_number"
    );
  }

  return ctx;
};

const getPurpose = (ctx) => {
  const rawPurpose = pickFirst(ctx?.purpose);
  const parsed = Number(rawPurpose);

  return Number.isFinite(parsed) && toText(rawPurpose) !== ""
    ? parsed
    : PURPOSE_SIGNUP_OR_LOGIN;
};

/* --------------------------------------------------
   REQUEST HELPERS
-------------------------------------------------- */

const requestWithProductRecovery = async (url, payload) => {
  try {
    return await api.post(url, payload, {
      requireAuth: false,
      withCredentials: true,
      headers: {
        "x-product-key": getDefaultProductKey(),
      },
    });
  } catch (err) {
    if (isProductNotFoundError(err) && (await ensureLoginProduct())) {
      return api.post(url, payload, {
        requireAuth: false,
        withCredentials: true,
        headers: {
          "x-product-key": getDefaultProductKey(),
        },
      });
    }

    throw err;
  }
};

const postFirstAvailablePath = async (paths = [], payload = {}) => {
  let lastError = null;

  for (const path of paths) {
    try {
      return await requestWithProductRecovery(path, payload);
    } catch (err) {
      lastError = err;

      const status = Number(err?.response?.status || 0);

      if (status !== 404 && status !== 405) {
        throw err;
      }
    }
  }

  throw lastError || new Error("OTP endpoint unavailable");
};

const shouldRetryWithSms = (err, via) => {
  if (String(via || "").toLowerCase() !== DEFAULT_VIA) return false;

  const status = Number(err?.response?.status || 0);

  return status >= 500 || status === 429;
};

/* --------------------------------------------------
   TOKEN EXTRACTION
-------------------------------------------------- */

const saveTokensFromVerifyResponse = (res) => {
  const payload = res?.data || {};

  const accessToken =
    payload?.accessToken ||
    payload?.access_token ||
    payload?.token ||
    "";

  const csrfToken =
    payload?.csrfToken ||
    payload?.csrf_token ||
    payload?.csrf ||
    res?.headers?.["x-csrf-token"] ||
    res?.headers?.["csrf-token"] ||
    "";

  if (accessToken || csrfToken) {
    hydrateAuthSession({
      accessToken,
      csrfToken,
      broadcast: true,
    });
  } else {
    authStore?.setSessionStartTime?.();
  }
};

/* --------------------------------------------------
   SEND OTP
-------------------------------------------------- */

export const sendOtp = async ({ via, disableFallback = false } = {}) => {
  const ctx = getOtpContext();

  const effectiveVia =
    String(via || ctx.via || DEFAULT_VIA).toLowerCase() === "sms"
      ? "sms"
      : "whatsapp";

  setJsonCookie(
    "otp_context",
    {
      ...ctx,
      via: effectiveVia,
    },
    { maxAge: 300, path: "/" }
  );

  const payload = {
    identifier_type: IDENTIFIER_TYPE_MOBILE,
    country_code: String(ctx.country_code).trim(),
    mobile_number: String(ctx.mobile_number).trim(),
    purpose: getPurpose(ctx),
    via: effectiveVia,
  };

  const otpKey = buildOtpKey(payload);

  if (OtpSendThrottle.key === otpKey && OtpSendThrottle.promise) {
    return OtpSendThrottle.promise;
  }

  const executeSend = async () => {
    try {
      const response = await postFirstAvailablePath(OTP_SEND_PATHS, payload);
      return response;
    } catch (err) {
      const status = getErrorStatus(err);
      const code = readBackendCode(err);

      if (status === 429 || code === OTP_ALREADY_SENT_CODE) {
        const waitSeconds = readBackendWaitSeconds(err) || OTP_DEFAULT_COOLDOWN_SECONDS;
        const message = readBackendMessage(err);
        writeCooldown(otpKey, {
          waitSeconds,
          message,
          code: code || OTP_ALREADY_SENT_CODE,
          kind: "throttled",
        });
      }

      if (disableFallback) throw err;

      if (!shouldRetryWithSms(err, effectiveVia)) throw err;

      const smsPayload = { ...payload, via: FALLBACK_VIA };

      setJsonCookie(
        "otp_context",
        {
          ...ctx,
          via: FALLBACK_VIA,
        },
        { maxAge: 300, path: "/" }
      );

      const response = await postFirstAvailablePath(OTP_SEND_PATHS, smsPayload);
      return response;
    }
  };

  OtpSendThrottle.key = otpKey;
  OtpSendThrottle.promise = executeSend().finally(() => {
    if (OtpSendThrottle.key === otpKey) {
      OtpSendThrottle.key = "";
      OtpSendThrottle.promise = null;
    }
  });

  return OtpSendThrottle.promise;
};

/* --------------------------------------------------
   VERIFY OTP
-------------------------------------------------- */

export const verifyOtp = async ({ otp }) => {
  const ctx = getOtpContext();

  const code = toText(otp);

  if (code.length !== 4) {
    throw new Error("OTP must be 4 digits");
  }

  const payload = {
    identifier_type: IDENTIFIER_TYPE_MOBILE,
    country_code: String(ctx.country_code).trim(),
    mobile_number: String(ctx.mobile_number).trim(),
    otp: code,
    purpose: getPurpose(ctx),
    product_key: getDefaultProductKey(),
  };

  let res = null;
  let lastError = null;

  try {
    for (const path of OTP_VERIFY_PATHS) {
      try {
        res = await requestWithProductRecovery(path, payload);
        break;
      } catch (err) {
        lastError = err;

        const status = Number(err?.response?.status || 0);

        if (status !== 404 && status !== 405) {
          throw err;
        }
      }
    }

    if (!res || !res?.data) {
      throw lastError || new Error("OTP verification failed");
    }
  } catch (error) {
    if (shouldClearAuthOnError(error)) {
      clearAuthFailureArtifacts();
    }
    throw error;
  }

  saveTokensFromVerifyResponse(res);

  return res;
};
