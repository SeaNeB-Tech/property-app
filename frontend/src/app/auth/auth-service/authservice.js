import { authApi, hydrateAuthSession } from "@/lib/api/client";
import { getJsonCookie, getCookie, removeCookie } from "@/services/auth.service";
import { authStore } from "./store/authStore";
import { clearPanelAuthSession } from "@/services/auth.service";
import { getAuthAppUrl } from "@/lib/core/appUrls";

const IDENTIFIER_TYPE_MOBILE = 0;
const PURPOSE_SIGNUP_OR_LOGIN = 0;
const PURPOSE_BUSINESS_MOBILE_VERIFY = 2;
const AUTH_COOKIE_WAIT_TIMEOUT_MS = 2000;
const AUTH_COOKIE_WAIT_POLL_MS = 120;
const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
const CSRF_COOKIE_NAMES = ["csrf_token_property"];
const OTP_VERIFY_PATHS = ["/auth/verify-otp", "/otp/verify-otp", "/auth/otp/verify-otp"];

const getFirstCookieValue = (names = []) => {
  for (const name of names) {
    const value = String(getCookie(name) || "").trim();
    if (value) return value;
  }
  return "";
};

export const waitForAuthCookies = async ({
  timeoutMs = AUTH_COOKIE_WAIT_TIMEOUT_MS,
  pollMs = AUTH_COOKIE_WAIT_POLL_MS,
} = {}) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const csrfToken = getFirstCookieValue(CSRF_COOKIE_NAMES);
    if (csrfToken) {
      return { ok: true, csrfToken, waitedMs: Date.now() - startedAt };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return { ok: false, csrfToken: "", waitedMs: Date.now() - startedAt };
};

export const hasCsrfCookie = () => Boolean(getFirstCookieValue(CSRF_COOKIE_NAMES));

const deepTokenValue = (payload = {}, keys = []) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.payload,
    payload?.response,
    payload?.session,
    payload?.tokens,
    payload?.data?.session,
    payload?.data?.tokens,
  ];
  for (const c of candidates) {
    if (!c) continue;
    for (const k of keys) {
      const val = String(c?.[k] || "").trim();
      if (val) return val;
    }
  }
  return "";
};

const readCsrfValueFromResponse = (response) => {
  const data = response?.data || {};
  const fromBody = deepTokenValue(data, ["csrf_token_property"]);
  const fromHeader = String(
    response?.headers?.["x-csrf-token"] || ""
  ).trim();
  return String(fromBody || fromHeader || "").trim();
};

const readAccessValueFromResponse = (response) => {
  const data = response?.data || {};
  return String(
    deepTokenValue(data, [
      "accessToken",
      "access_token",
      "token",
      "jwt",
    ]) ||
      ""
  ).trim();
};

const readBoolFromPayload = (payload = {}, keys = []) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.payload,
    payload?.response,
    payload?.session,
    payload?.tokens,
    payload?.data?.session,
    payload?.data?.tokens,
  ];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    for (const key of keys) {
      const value = c?.[key];
      if (typeof value === "boolean") return value;
      const normalized = String(value ?? "").trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(normalized)) return true;
      if (["false", "0", "no", "n"].includes(normalized)) return false;
    }
  }
  return null;
};

const verifyOtpRequest = async (payload) => {
  let lastError = null;
  for (const path of OTP_VERIFY_PATHS) {
    try {
      return await authApi.post(path, payload, {
        withCredentials: true,
        headers: { "x-product-key": PRODUCT_KEY },
      });
    } catch (err) {
      lastError = err;
      const status = Number(err?.response?.status || 0);
      if (status !== 404 && status !== 405) {
        throw err;
      }
    }
  }
  throw lastError || new Error("OTP verification failed");
};

export const verifyOtpAndLogin = async ({ otp, context } = {}) => {
  const ctx = context || getJsonCookie("otp_context");
  if (!ctx) throw new Error("OTP context missing");

  const otpPurpose =
    Number.isFinite(Number(ctx.purpose)) &&
    String(ctx.purpose).trim() !== ""
      ? Number(ctx.purpose)
      : PURPOSE_SIGNUP_OR_LOGIN;

  const verifyPayload = {
    identifier_type: IDENTIFIER_TYPE_MOBILE,
    country_code: String(ctx.country_code).trim(),
    mobile_number: String(ctx.mobile_number).trim(),
    otp: String(otp).trim(),
    purpose: otpPurpose,
    product_key: PRODUCT_KEY,
  };

  const res = await verifyOtpRequest(verifyPayload);
  const data = res.data || {};

  const responseAccessToken = readAccessValueFromResponse(res);
  const responseCsrfToken = readCsrfValueFromResponse(res);
  if (responseAccessToken || responseCsrfToken) {
    hydrateAuthSession({
      accessToken: responseAccessToken,
      csrfToken: responseCsrfToken,
      broadcast: true,
    });
  }

  const isExistingUserField = readBoolFromPayload(data, ["is_existing_user", "isExistingUser"]);
  const userExistsField = readBoolFromPayload(data, ["user_exists", "userExists", "existing_user"]);
  const profileCompletedField = readBoolFromPayload(data, ["profile_completed", "profileCompleted"]);
  const isExistingUser =
    isExistingUserField === true ||
    userExistsField === true ||
    profileCompletedField === true;
  const requiresRegistration = !isExistingUser;

  if (requiresRegistration) {
    removeCookie("otp_in_progress");
    return {
      sessionConfirmed: false,
      isExistingUser: false,
      requiresRegistration: true,
      reason: "NEW_USER",
    };
  }

  if (!(responseAccessToken || responseCsrfToken)) {
    authStore.setSessionStartTime();
  }

  removeCookie("otp_in_progress");

  return {
    sessionConfirmed: true,
    isExistingUser: true,
    requiresRegistration: false,
    user: null,
    ...(otpPurpose === PURPOSE_BUSINESS_MOBILE_VERIFY ? { businessMobileVerified: true } : {}),
  };
};

export const logout = async () => {
  let canClearClientState = false;
  try {
    await authApi.post(
      "/auth/logout",
      { product_key: PRODUCT_KEY },
      {
        headers: {
          "x-product-key": PRODUCT_KEY,
        },
      }
    );
    canClearClientState = true;
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 401 || status === 403) {
      canClearClientState = true;
    } else {
      throw error;
    }
  }

  if (!canClearClientState) return;
  authStore.clearAll();
  clearPanelAuthSession();
  window.location.href = getAuthAppUrl("/auth/login");
};
