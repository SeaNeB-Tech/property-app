// src/services/authservice.js

import api, {
  getInMemoryCsrfToken,
  setInMemoryAccessToken,
  setInMemoryCsrfToken,
} from "@/lib/api/client";
import {
  getDefaultProductKey,
} from "@/services/product.service";
import { getJsonCookie, getCookie, removeCookie } from "@/services/cookie";
import { authStore } from "./store/authStore";
import { clearPanelAuthSession } from "@/services/authSession.service";
import { getListingAppUrl } from "@/lib/appUrls";

const IDENTIFIER_TYPE_MOBILE = 0;
const PURPOSE_SIGNUP_OR_LOGIN = 0;
const AUTH_COOKIE_WAIT_TIMEOUT_MS = 2000;
const AUTH_COOKIE_WAIT_POLL_MS = 120;
const CSRF_COOKIE_NAME = "csrf_token_property";
const REFRESH_COOKIE_NAME = "refresh_token_property";
let refreshInFlightPromise = null;

/* ------------------------------------------------ */
/* 🔐 HELPERS */
/* ------------------------------------------------ */

export const waitForAuthCookies = async ({
  timeoutMs = AUTH_COOKIE_WAIT_TIMEOUT_MS,
  pollMs = AUTH_COOKIE_WAIT_POLL_MS,
} = {}) => {
  const startedAt = Date.now();
  let csrfToken = "";
  let refreshCookieVisible = false;

  while (Date.now() - startedAt < timeoutMs) {
    csrfToken = String(getCookie(CSRF_COOKIE_NAME) || "").trim();
    // HttpOnly refresh cookies are not readable by JS; this will be false in secure setups.
    refreshCookieVisible = Boolean(String(getCookie(REFRESH_COOKIE_NAME) || "").trim());

    if (csrfToken) {
      return {
        ok: true,
        csrfToken,
        refreshCookieVisible,
        waitedMs: Date.now() - startedAt,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    ok: false,
    csrfToken: "",
    refreshCookieVisible,
    waitedMs: Date.now() - startedAt,
  };
};

export const hasCsrfCookie = () => Boolean(String(getCookie(CSRF_COOKIE_NAME) || "").trim());

const waitForCsrfCookie = async ({ timeoutMs = AUTH_COOKIE_WAIT_TIMEOUT_MS, pollMs = AUTH_COOKIE_WAIT_POLL_MS } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const csrf = String(getCookie(CSRF_COOKIE_NAME) || "").trim();
    if (csrf) return csrf;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return "";
};

const getLatestCsrfCookieValue = () =>
  String(getCookie(CSRF_COOKIE_NAME) || getInMemoryCsrfToken() || "").trim();

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
  const fromBody = deepTokenValue(data, ["csrf_token", "csrfToken"]);
  const fromHeader = String(
    response?.headers?.["x-csrf-token"] ||
      response?.headers?.["csrf-token"] ||
      response?.headers?.["x-xsrf-token"] ||
      ""
  ).trim();
  return String(fromBody || fromHeader || "").trim();
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

const tryFetchSession = async () => {
  try {
    const res = await api.get("/profile/me", {
      withCredentials: true,
      skipAuthRedirect: true,
      skipRefresh: true,
    });
    return res?.data || null;
  } catch {
    return null;
  }
};

const setAccessTokenEverywhere = (token) => {
  const safeToken = String(token || "").trim();
  authStore.setAccessToken(safeToken);
  setInMemoryAccessToken(safeToken);
};

/* ------------------------------------------------ */
/* 🔐 OTP VERIFY */
/* ------------------------------------------------ */

export const verifyOtpAndLogin = async ({ otp, context } = {}) => {
  const ctx = context || getJsonCookie("otp_context");
  if (!ctx) throw new Error("OTP context missing");

  const verifyPayload = {
    identifier_type: IDENTIFIER_TYPE_MOBILE,
    country_code: String(ctx.country_code).trim(),
    mobile_number: String(ctx.mobile_number).trim(),
    otp: String(otp).trim(),
    purpose:
      Number.isFinite(Number(ctx.purpose)) &&
      String(ctx.purpose).trim() !== ""
        ? Number(ctx.purpose)
        : PURPOSE_SIGNUP_OR_LOGIN,
    product_key: getDefaultProductKey(),
  };

  console.log("[auth] OTP verify start");

  const res = await api.post("/otp/verify-otp", verifyPayload, {
    withCredentials: true,
  });

  const data = res.data || {};
  const responseCsrfToken = readCsrfValueFromResponse(res);
  const accessToken = deepTokenValue(data, [
    "access_token",
    "accessToken",
    "token",
    "jwt",
  ]);
  const hasImmediateAccessToken = Boolean(accessToken);

  if (accessToken) {
    console.log("[auth] OTP verify returned access token in response");
    setAccessTokenEverywhere(accessToken);
  }
  if (responseCsrfToken) {
    setInMemoryCsrfToken(responseCsrfToken);
    console.log("[auth] OTP verify returned csrf token in response");
  }

  const isExistingUserField = readBoolFromPayload(data, ["is_existing_user", "isExistingUser"]);
  const userExistsField = readBoolFromPayload(data, ["user_exists", "userExists", "existing_user"]);
  const profileCompletedField = readBoolFromPayload(data, ["profile_completed", "profileCompleted"]);
  const isExistingUser =
    isExistingUserField === true ||
    userExistsField === true ||
    profileCompletedField === true;
  const requiresRegistration = !isExistingUser;

  console.log(
    `[auth] user classification: existing=${isExistingUser} (is_existing_user=${isExistingUserField}, user_exists=${userExistsField}, profile_completed=${profileCompletedField})`
  );

  if (requiresRegistration) {
    removeCookie("otp_in_progress");
    return {
      sessionConfirmed: false,
      isExistingUser: false,
      requiresRegistration: true,
      reason: "NEW_USER",
    };
  }

  authStore.setSessionStartTime();
  console.log("[auth] session timer initialized");

  // If OTP verify already returned a usable access token, try confirming session immediately.
  if (hasImmediateAccessToken) {
    const immediateSession = await tryFetchSession();
    if (immediateSession) {
      removeCookie("otp_in_progress");
      return {
        sessionConfirmed: true,
        isExistingUser: true,
        requiresRegistration: false,
      };
    }
  }

  // Existing users must have CSRF before refresh.
  console.log("[auth] waiting for csrf_token_property before refresh");
  const csrfFromCookie = await waitForCsrfCookie();
  if (!csrfFromCookie) {
    console.warn("[auth] csrf_token_property not available for existing user");
    if (hasImmediateAccessToken) {
      removeCookie("otp_in_progress");
      return {
        sessionConfirmed: true,
        isExistingUser: true,
        requiresRegistration: false,
      };
    }
    return {
      sessionConfirmed: false,
      isExistingUser: true,
      requiresRegistration: false,
      reason: "MISSING_CSRF_COOKIE",
    };
  }

  try {
    await refreshAccessToken();
    console.log("[auth] refresh success after OTP");
  } catch (err) {
    console.warn("[auth] refresh failed after OTP:", err?.message || err);
    const fallbackSession = await tryFetchSession();
    if (fallbackSession || hasImmediateAccessToken) {
      console.log("[auth] session preserved after refresh failure via existing token/profile fallback");
      removeCookie("otp_in_progress");
      return {
        sessionConfirmed: true,
        isExistingUser: true,
      };
    }
    return {
      sessionConfirmed: false,
      isExistingUser: true,
      requiresRegistration: false,
      reason: "REFRESH_FAILED",
    };
  }

  const session = await tryFetchSession();
  const sessionConfirmed = Boolean(session);
  console.log(`[auth] /profile/me session check: ${sessionConfirmed ? "OK" : "FAILED"}`);

  if (sessionConfirmed) removeCookie("otp_in_progress");

  return {
    sessionConfirmed,
    isExistingUser: true,
    requiresRegistration: false,
  };
};

/* ------------------------------------------------ */
/* 🔐 REFRESH TOKEN */
/* ------------------------------------------------ */

export const refreshAccessToken = async () => {
  if (refreshInFlightPromise) {
    console.log("[auth] refresh already in-flight, reusing promise");
    return refreshInFlightPromise;
  }

  refreshInFlightPromise = (async () => {
    console.log("[auth] refresh start");

    const csrfToken = getLatestCsrfCookieValue();
    if (!csrfToken) {
      throw new Error("Missing csrf_token_property cookie");
    }

    const productKey = String(getDefaultProductKey() || "property").trim() || "property";

    const res = await api.post(
      "/auth/refresh",
      { product_key: productKey },
      {
        withCredentials: true,
        skipRefresh: true,
        skipAuthRedirect: true,
        headers: {
          "x-product-key": productKey,
          "x-csrf-token": csrfToken,
        },
      },
    );

    let newToken = deepTokenValue(res?.data, [
      "access_token",
      "accessToken",
      "token",
      "jwt",
    ]);

    if (!newToken) {
      const headerToken = String(
        res?.headers?.authorization ||
          res?.headers?.Authorization ||
          res?.headers?.["x-access-token"] ||
          ""
      ).trim();
      if (/^bearer\s+/i.test(headerToken)) {
        newToken = headerToken.replace(/^bearer\s+/i, "").trim();
      }
    }

    if (!newToken) throw new Error("No access token returned");

    setAccessTokenEverywhere(newToken);
    console.log("[auth] refresh success, access token updated in memory");
    return newToken;
  })();

  try {
    return await refreshInFlightPromise;
  } finally {
    refreshInFlightPromise = null;
  }
};

/* ------------------------------------------------ */
/* 🔐 LOGOUT */
/* ------------------------------------------------ */

export const logout = async () => {
  try {
    const csrfToken = getCookie("csrf_token_property");
    const accessToken = authStore.getAccessToken();
    const productKey = getDefaultProductKey();

    await api.post(
      "/auth/logout",
      { product_key: productKey },
      {
        withCredentials: true,
        headers: {
          "x-product-key": productKey,
          ...(csrfToken && { "x-csrf-token": csrfToken }),
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
      }
    );
  } catch (_) {}

  authStore.clearAll();
  clearPanelAuthSession();
  window.location.href = getListingAppUrl("/home");
};
