import api from "@/lib/api/client";
import { authStore } from "./store/authStore";
import { getDefaultProductKey, getDefaultProductName } from "@/services/product.service";
import { getJsonCookie, setJsonCookie } from "@/services/cookie";
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
    return await api.post(url, payload);
  } catch (err) {
    if (isProductNotFoundError(err) && (await ensureLoginProduct())) {
      return api.post(url, payload);
    }
    throw err;
  }
};

const shouldRetryWithSms = (err, via) => {
  if (String(via || "").toLowerCase() !== DEFAULT_VIA) return false;
  const status = Number(err?.response?.status || 0);
  return status >= 500 || status === 429;
};

const saveTokensFromVerifyResponse = (res) => {
  const data = res?.data || {};

  if (data.access_token) authStore.setAccessToken(data.access_token);

  // Refresh tokens and CSRF tokens are set as HTTP-only cookies by the backend;
  // do not attempt to extract them from the response body. Read from cookies instead.
  // The authStore will get CSRF from cookies when needed.

  authStore.setSessionStartTime();
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
    product_key: getDefaultProductKey(),
  };

  try {
    return await requestWithProductRecovery("/otp/send-otp", payload);
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
    return requestWithProductRecovery("/otp/send-otp", smsPayload);
  }
};

export const verifyOtp = async ({ otp }) => {
  const ctx = getOtpContext();
  const code = toText(otp);
  if (code.length !== 4) throw new Error("OTP must be 4 digits");

  const res = await requestWithProductRecovery("/otp/verify-otp", {
    identifier_type: IDENTIFIER_TYPE_MOBILE,
    country_code: String(ctx.country_code).trim(),
    mobile_number: String(ctx.mobile_number).trim(),
    otp: code,
    purpose: getPurpose(ctx),
    product_key: getDefaultProductKey(),
  });

  saveTokensFromVerifyResponse(res);
  return res;
};

