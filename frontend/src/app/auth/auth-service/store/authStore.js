"use client";

import { getCookie, removeCookie } from "@/services/auth.service";

const CSRF_COOKIE_KEYS = [
  "csrf_token",
  "csrf-token",
  "XSRF-TOKEN",
  "xsrf-token",
  "XSRF_TOKEN",
  "_csrf",
];

const AUTH_COOKIE_KEYS = [
  ...CSRF_COOKIE_KEYS,
];
const parseCookies = () => {
  if (typeof window === "undefined") return {};
  const pairs = document.cookie.split("; ");
  const cookieMap = {};

  for (const pair of pairs) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const key = decodeURIComponent(pair.slice(0, index));
    const value = decodeURIComponent(pair.slice(index + 1));
    cookieMap[key] = value;
  }

  return cookieMap;
};

const authStore = {
  accessToken: null,
  refreshToken: null,
  csrfToken: null,

  getAccessToken() {
    if (this.accessToken) return this.accessToken;
    // Cookie-only auth: do not depend on readable access token in JS.
    const csrfHint = String(getCookie("csrf_token_property") || "").trim();
    return csrfHint ? "COOKIE_SESSION" : null;
  },

  setAccessToken(token) {
    const safeToken = String(token || "").trim();
    this.accessToken = safeToken || null;
    if (!safeToken) return;
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("auth_redirect_in_progress");
      }
    } catch {}
  },

  getRefreshToken() {
    return this.refreshToken || null;
  },

  setRefreshToken(token) {
    const safeToken = String(token || "").trim();
    this.refreshToken = safeToken || null;
  },

  getSessionStartTime() {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.sessionStorage.getItem("auth_session_start");
      return stored ? new Date(stored) : null;
    } catch {
      return null;
    }
  },

  setSessionStartTime() {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem("auth_session_start", new Date().toISOString());
    } catch {
      // Ignore storage errors
    }
  },

  setSession({ access_token, refresh_token, csrf_token }) {
    this.setAccessToken(access_token);
    this.setRefreshToken(refresh_token);
    this.setCsrfToken(csrf_token);
    this.setSessionStartTime();
  },

  getCsrfToken() {
    const cookieToken = String(getCookie("csrf_token_property") || "").trim();
    if (cookieToken) return cookieToken;
    return this.csrfToken || null;
  },

  setCsrfToken(token) {
    const safeToken = String(token || "").trim();
    this.csrfToken = safeToken || null;
  },

  clearAll() {
    this.accessToken = null;
    this.refreshToken = null;
    this.csrfToken = null;
    AUTH_COOKIE_KEYS.forEach((key) => removeCookie(key));
  },

  dumpAuthState() {
    const cookies = parseCookies();
    const getLength = (value) => (value ? String(value).length : 0);

    console.log("[authStore] Snapshot", {
      memory: {
        accessToken: getLength(this.accessToken),
        refreshToken: getLength(this.refreshToken),
        csrfToken: getLength(this.csrfToken),
      },
      cookies: {
        access_token: getLength(cookies.access_token),
        refresh_token: getLength(cookies.refresh_token),
        csrf_token: getLength(cookies.csrf_token || cookies["csrf-token"] || cookies["XSRF-TOKEN"]),
        session_start_time: getLength(cookies.session_start_time),
      },
    });
  },

  initFromResponseHeaders(headers) {
    if (!headers) return;

    const csrf =
      headers["x-csrf-token"] ||
      headers["csrf-token"] ||
      headers["x-xsrf-token"] ||
      headers["xsrf-token"];

    if (csrf) {
      this.setCsrfToken(csrf);
    }
  },
};

export const getAllCookies = parseCookies;
export { authStore };
