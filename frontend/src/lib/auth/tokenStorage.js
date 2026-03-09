import { authStore } from "@/app/auth/auth-service/store/authStore";
import { getCookie, removeCookie } from "@/lib/auth/cookieManager";
import {
  getInMemoryAccessToken,
  getInMemoryCsrfToken,
  setInMemoryAccessToken,
  setInMemoryCsrfToken,
} from "@/lib/api/client";

const REFRESH_TOKEN_COOKIE_KEYS = ["refresh_token_property"];

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

export const getAccessToken = () => {
  logSafeMode();
  return String(getInMemoryAccessToken() || authStore?.accessToken || "").trim();
};

export const setAccessToken = (token, _options = {}) => {
  logSafeMode();
  authStore?.setAccessToken?.(token);
  setInMemoryAccessToken(token);
  return String(token || "").trim();
};

export const clearAccessToken = (options = {}) => {
  logSafeMode();
  authStore?.setAccessToken?.("");
  setInMemoryAccessToken("");
  setInMemoryCsrfToken("");
  removeCookie("access_token", { path: "/", ...options });
};

export const getRefreshToken = () => {
  logSafeMode();
  return String(authStore?.getRefreshToken?.() || readFirstCookie(REFRESH_TOKEN_COOKIE_KEYS) || "").trim();
};

export const setRefreshToken = (_token, _options = {}) => {
  logSafeMode();
  // Backend owns refresh cookie lifecycle.
};

export const clearRefreshToken = (options = {}) => {
  logSafeMode();
  authStore?.setRefreshToken?.("");
  removeCookie("refresh_token_property", options);
};

export const getCsrfToken = () => {
  logSafeMode();
  return String(getInMemoryCsrfToken() || authStore?.getCsrfToken?.() || "").trim();
};

