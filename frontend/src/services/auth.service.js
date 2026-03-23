import { removeCookie } from "@/lib/core/cookies";
import {
  authApi,
  clearInMemoryAccessToken,
  setInMemoryCsrfToken,
} from "@/lib/api/client";
import { authStore } from "@/app/auth/auth-service/store/authStore";

const AUTH_CHANGE_EVENT = "seaneb:auth-changed";
const LOGOUT_ENDPOINT = "/v1/logout";
const AUTH_FAILURE_STATUS = new Set([401, 403]);
const AUTH_FAILURE_CODES = new Set([
  "USER_NOT_FOUND",
  "AUTH_USER_NOT_FOUND",
  "INVALID_SESSION",
  "SESSION_INVALID",
  "INVALID_REFRESH_TOKEN",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_EXPIRED",
  "AUTH_FAILED",
  "AUTH_INVALID",
  "USER_DATA_MISSING",
  "DB_USER_MISSING",
  "NO_USER",
]);
const AUTH_FAILURE_SKIP_CODES = new Set([
  "OTP_INVALID",
  "OTP_RATE_LIMITED",
  "BRIDGE_TOKEN_REPLAYED",
]);
const AUTH_FAILURE_MESSAGE_PATTERNS = [
  /user\s+not\s+found/i,
  /no\s+user/i,
  /user\s+missing/i,
  /invalid\s+session/i,
  /session\s+invalid/i,
  /invalid\s+refresh/i,
  /refresh\s+token/i,
  /token\s+expired/i,
  /auth(entication)?\s+failed/i,
  /database.*user/i,
  /user\s+data.*missing/i,
];
const AUTH_FAILURE_SKIP_MESSAGE_PATTERNS = [
  /invalid\s*otp/i,
  /otp\s+invalid/i,
  /otp\s+expired/i,
  /otp\s+must/i,
  /bridge\s+token.*replay/i,
];
const AUTH_STORAGE_PREFIX = "property:volatile:";
const DEFAULT_COOKIE_DOMAIN =
  String(process.env.NODE_ENV || "").trim() === "production" ? ".seaneb.com" : "";
const AUTH_STORAGE_KEYS = [
  "auth_session",
  "auth_session_start",
  "auth_redirect_in_progress",
  "otp_context",
  "otp_in_progress",
  "otp_cc",
  "otp_mobile",
  "post_otp_verified",
  "signup_otp_verified",
  "verified_mobile",
  "mobile_verified",
  "mobile_otp_until",
  "email_otp_until",
  "profile_completed",
  "business_registered",
  "business_id",
  "branch_id",
  "business_name",
  "display_name",
  "business_type",
  "business_location",
  "business_email",
  "about_branch",
  "branch_activation_status",
  "branch_activation_branch_id",
  "payment_order_id",
  "payment_session_id",
  "payment_last_error",
  "business_subscription_active",
  "business_subscription_branch_id",
  "verified_email",
  "user_email",
  "seaneb_id",
  "auth_return_to",
  "seaneb_sso_exchange_result",
];

export {
  clearGuestCsrfCookies,
  clearPreAuthCsrfCookies,
  getCookie,
  getJsonCookie,
  removeCookie,
  setCookie,
  setJsonCookie,
} from "@/lib/core/cookies";

export const isAuthenticatedByCookies = () => {
  if (typeof document === "undefined") return false;
  const cookies = String(document.cookie || "");
  if (!cookies) return false;
  const authCookieNames = [
    "refresh_token_property",
    "refresh_token",
    "refreshToken",
    "csrf_token_property",
    "csrf_token",
    "access_token",
    "accessToken",
  ];
  return authCookieNames.some((name) => {
    const match = cookies.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
    return match && match[2] && match[2].trim().length > 0;
  });
};

const AUTH_COOKIE_SEEDS = [
  "access_token",
  "access_token_property",
  "accessToken",
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
  "refreshtoken",
  "csrf_token_property",
  "property_csrf_token",
  "csrf_token",
  "csrfToken",
  "csrf-token",
  "XSRF-TOKEN",
  "xsrf-token",
  "XSRF_TOKEN",
  "_csrf",
  "csrftoken",
  "auth_session",
  "auth_session_start",
  "auth_redirect_in_progress",
];

const AUTH_COOKIE_PREFIXES = [
  "access_token",
  "refresh_token",
  "csrf_token",
  "xsrf",
  "csrftoken",
  "auth_session",
];

const collectAuthCookieNames = () => {
  const names = new Set(AUTH_COOKIE_SEEDS);
  if (typeof document === "undefined") return Array.from(names);

  const pairs = String(document.cookie || "").split("; ");
  for (const pair of pairs) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const rawName = decodeURIComponent(pair.slice(0, index));
    const lower = rawName.trim().toLowerCase();
    if (!lower) continue;
    if (AUTH_COOKIE_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix))) {
      names.add(rawName);
    }
  }

  return Array.from(names);
};

const forceExpireCookie = (name, domain = "") => {
  if (typeof document === "undefined") return;
  const isSecure = window.location.protocol === "https:";
  const sameSite = isSecure ? "None" : "Lax";
  const securePart = isSecure ? "; Secure" : "";
  const base = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=${sameSite}${securePart}`;
  document.cookie = base;
  if (domain) {
    document.cookie = `${base}; domain=${domain}`;
  }
};

const forceDeleteAuthCookies = () => {
  if (typeof window === "undefined") return;
  const configuredDomain = DEFAULT_COOKIE_DOMAIN;
  const host = String(window.location.hostname || "").toLowerCase();
  const maybeParentDomain = host.includes(".") ? `.${host.split(".").slice(-2).join(".")}` : "";
  const domains = Array.from(new Set(["", configuredDomain, maybeParentDomain].filter(Boolean)));
  const cookieNames = collectAuthCookieNames();
  for (const name of cookieNames) {
    for (const domain of domains) {
      forceExpireCookie(name, domain);
    }
  }
};

const extractAuthFailureDetails = (error = {}, payload = null) => {
  const status = Number(error?.response?.status || error?.status || payload?.status || 0);
  const data = error?.response?.data ?? error?.data ?? payload ?? {};
  const code = String(data?.error?.code || data?.code || data?.errorCode || "").trim();
  const message = String(
    data?.error?.message || data?.message || error?.message || ""
  ).trim();

  return { status, code, message };
};

export const shouldClearAuthOnError = (error = {}, payload = null) => {
  const { status, code, message } = extractAuthFailureDetails(error, payload);
  const lowerCode = code.toUpperCase();

  if (AUTH_FAILURE_SKIP_CODES.has(lowerCode)) return false;
  if (AUTH_FAILURE_SKIP_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return false;

  if (AUTH_FAILURE_STATUS.has(status)) return true;
  if (AUTH_FAILURE_CODES.has(lowerCode)) return true;
  if (AUTH_FAILURE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) return true;

  return false;
};

export const clearAuthFailureArtifacts = () => {
  forceDeleteAuthCookies();
  clearPanelAuthSession();

  for (const key of AUTH_STORAGE_KEYS) {
    removeCookie(key);
  }

  if (typeof window === "undefined") return;

  const clearKey = (storage, key) => {
    try {
      storage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  };

  for (const key of AUTH_STORAGE_KEYS) {
    clearKey(window.localStorage, key);
    clearKey(window.sessionStorage, key);
    clearKey(window.localStorage, `${AUTH_STORAGE_PREFIX}${key}`);
    clearKey(window.sessionStorage, `${AUTH_STORAGE_PREFIX}${key}`);
  }
};

export const clearPanelAuthSession = () => {
  clearInMemoryAccessToken();
  setInMemoryCsrfToken("");
  authStore.clearAll();
  removeCookie("csrf_token_property");
  notifyAuthChanged();
};

export const logoutPanelSession = async () => {
  let canClearClientState = false;
  try {
    await authApi.post(LOGOUT_ENDPOINT, {}, { skipAuthRedirect: true });
    canClearClientState = true;
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 401 || status === 403) {
      canClearClientState = true;
    } else {
      throw error;
    }
  } finally {
    if (canClearClientState) {
      forceDeleteAuthCookies();
      for (const key of AUTH_STORAGE_KEYS) {
        removeCookie(key);
      }
      clearPanelAuthSession();
    }
  }
  return canClearClientState;
};

export const notifyAuthChanged = (detail = {}) => {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail }));
    } else {
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    }
  } catch {
    // Ignore event dispatch issues.
  }
};

export const subscribeAuthState = (callback) => {
  if (typeof window === "undefined") return () => {};

  const listener = (event) => callback(event);
  window.addEventListener("focus", listener);
  window.addEventListener("property:cookie-change", listener);
  window.addEventListener(AUTH_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("focus", listener);
    window.removeEventListener("property:cookie-change", listener);
    window.removeEventListener(AUTH_CHANGE_EVENT, listener);
  };
};
