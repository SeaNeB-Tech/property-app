import api from "@/lib/api/client";
import { authStore } from "./store/authStore";
import { getDefaultProductKey, getDefaultProductName } from "@/services/dashboard.service";
import { getJsonCookie, setJsonCookie } from "@/services/auth.service";
import { setInMemoryAccessToken, setInMemoryCsrfToken } from "@/lib/api/client";
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
// Same-origin Next proxy routes
const OTP_SEND_PATHS = ["/otp/send-otp"];
const OTP_VERIFY_PATHS = ["/auth/verify-otp", "/otp/verify-otp"];

const isProductNotFoundError = (err) =>
  getErrorStatus(err) === 404 && getErrorText(err).includes("product not found");

const ensureLoginProduct = async () => {
  try {
    await api.post("/products", {
      product_key: getDefaultProductKey(),
      product_name: getDefaultProductName(),
    });
    return true;
  } catch (err) {
    return getErrorStatus(err) === 409;
  }
};

const getOtpContext = () => {
  const ctx = getJsonCookie("otp_context");
  if (!ctx) throw new Error("OTP context missing");
  if (!ctx.country_code || !ctx.mobile_number) {
    throw new Error("Invalid OTP context - missing country_code or mobile_number");
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

const requestWithProductRecovery = async (url, payload) => {
  try {
    return await api.post(url, payload, {
      withCredentials: true,
      headers: {
        "x-product-key": getDefaultProductKey(),
      },
    });
  } catch (err) {
    if (isProductNotFoundError(err) && (await ensureLoginProduct())) {
      return api.post(url, payload, {
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

const saveTokensFromVerifyResponse = (res) => {
  // Extract tokens from the OTP verification response and save them
  const payload = res?.data || {};
  const accessToken = payload?.accessToken || payload?.access_token || payload?.token;
  const refreshToken = payload?.refreshToken || payload?.refresh_token;
  const csrfToken = payload?.csrfToken || payload?.csrf_token || payload?.csrf;

  if (accessToken || refreshToken || csrfToken) {
    authStore.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      csrf_token: csrfToken,
    });
    if (accessToken) setInMemoryAccessToken(accessToken);
    if (csrfToken) setInMemoryCsrfToken(csrfToken);
  } else {
    // Fallback: just set session start time if no tokens in response
    authStore.setSessionStartTime();
  }
};

export const sendOtp = async ({ via } = {}) => {
  const ctx = getOtpContext();
  const effectiveVia = String(via || ctx.via || DEFAULT_VIA).toLowerCase() === "sms" ? "sms" : "whatsapp";

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

  try {
    return await postFirstAvailablePath(OTP_SEND_PATHS, payload);
  } catch (err) {
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
    return postFirstAvailablePath(OTP_SEND_PATHS, smsPayload);
  }
};

export const verifyOtp = async ({ otp }) => {
  const ctx = getOtpContext();
  const code = toText(otp);
  if (code.length !== 4) throw new Error("OTP must be 4 digits");

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

  if (!res) {
    throw lastError || new Error("OTP verification failed");
  }

  saveTokensFromVerifyResponse(res);
  return res;
};

