import { authStore } from "@/app/auth/auth-service/store/authStore";
import { getCookie, removeCookie } from "@/lib/auth/cookieManager";
import {
  getInMemoryAccessToken,
  getInMemoryCsrfToken,
  setInMemoryAccessToken,
  setInMemoryCsrfToken,
} from "@/lib/api/client";

const REFRESH_TOKEN_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
];

const CSRF_COOKIE_KEYS = [
  "csrf_token_property",
  "csrf_token",
  "csrfToken",
];

const logSafeMode = () => {
  if (typeof globalThis === "undefined") return;
  if (globalThis.__SEANEB_AUTH_SAFE_MODE_TOKEN_STORAGE_FA__) return;

  globalThis.__SEANEB_AUTH_SAFE_MODE_TOKEN_STORAGE_FA__ = true;

  console.info("[AUTH SAFE MODE] using shared auth layer");
};

const readFirstCookie = (keys = []) => {
  for (const key of keys) {
    const value = String(getCookie(key) || "").trim();
    if (value) return value;
  }
  return "";
};

/* -----------------------------------------
 ACCESS TOKEN
----------------------------------------- */

export const getAccessToken = () => {
  logSafeMode();

  return String(
    getInMemoryAccessToken() ||
      authStore?.accessToken ||
      ""
  ).trim();
};

export const setAccessToken = (token, _options = {}) => {
  logSafeMode();

  const normalized = String(token || "").trim();

  authStore?.setAccessToken?.(normalized);
  setInMemoryAccessToken(normalized);

  return normalized;
};

export const clearAccessToken = (options = {}) => {
  logSafeMode();

  authStore?.setAccessToken?.("");

  setInMemoryAccessToken("");
  setInMemoryCsrfToken("");

  removeCookie("access_token", { path: "/", ...options });
};

/* -----------------------------------------
 REFRESH TOKEN
----------------------------------------- */

export const getRefreshToken = () => {
  logSafeMode();

  return String(
    authStore?.getRefreshToken?.() ||
      readFirstCookie(REFRESH_TOKEN_COOKIE_KEYS) ||
      ""
  ).trim();
};

export const setRefreshToken = (_token, _options = {}) => {
  logSafeMode();
  // Refresh cookie lifecycle handled by backend
};

export const clearRefreshToken = (options = {}) => {
  logSafeMode();

  authStore?.setRefreshToken?.("");

  for (const key of REFRESH_TOKEN_COOKIE_KEYS) {
    removeCookie(key, options);
  }
};

/* -----------------------------------------
 CSRF TOKEN
----------------------------------------- */

export const getCsrfToken = () => {
  logSafeMode();

  return String(
    getInMemoryCsrfToken() ||
      authStore?.getCsrfToken?.() ||
      readFirstCookie(CSRF_COOKIE_KEYS) ||
      ""
  ).trim();
};

export const setCsrfToken = (token) => {
  logSafeMode();

  const normalized = String(token || "").trim();

  authStore?.setCsrfToken?.(normalized);
  setInMemoryCsrfToken(normalized);

  return normalized;
};