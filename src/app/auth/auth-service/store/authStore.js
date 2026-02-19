"use client";

import { getCookie, removeCookie, setCookie } from "@/services/cookie";

const ACCESS_TOKEN_MAX_AGE = 15 * 60;
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;
const CSRF_TOKEN_MAX_AGE = 6 * 60 * 60;
const SESSION_MAX_AGE = 6 * 60 * 60;

const CSRF_COOKIE_KEYS = [
  "csrf_token",
  "csrf-token",
  "XSRF-TOKEN",
  "xsrf-token",
  "XSRF_TOKEN",
  "_csrf",
];

const AUTH_COOKIE_KEYS = [
  "access_token",
  "refresh_token",
  "access_token_issued_time",
  "session_start_time",
  ...CSRF_COOKIE_KEYS,
];

const getFirstCookieValue = (keys = []) => {
  for (const key of keys) {
    const value = String(getCookie(key) || "").trim();
    if (value) return value;
  }
  return null;
};

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

    const token = String(getCookie("access_token") || "").trim();
    if (!token) return null;

    this.accessToken = token;
    return token;
  },

  setAccessToken(token) {
    const safeToken = String(token || "").trim();
    this.accessToken = safeToken || null;

    if (safeToken) {
      setCookie("access_token", safeToken, { maxAge: ACCESS_TOKEN_MAX_AGE, path: "/" });
      setCookie("access_token_issued_time", String(Date.now()), {
        maxAge: ACCESS_TOKEN_MAX_AGE,
        path: "/",
      });
      return;
    }

    removeCookie("access_token");
    removeCookie("access_token_issued_time");
  },

  getRefreshToken() {
    if (this.refreshToken) return this.refreshToken;

    const token = String(getCookie("refresh_token") || "").trim();
    if (!token) return null;

    this.refreshToken = token;
    return token;
  },

  setRefreshToken(token) {
    const safeToken = String(token || "").trim();
    this.refreshToken = safeToken || null;

    if (safeToken) {
      setCookie("refresh_token", safeToken, { maxAge: REFRESH_TOKEN_MAX_AGE, path: "/" });
      return;
    }

    removeCookie("refresh_token");
  },

  getSessionStartTime() {
    const raw = String(getCookie("session_start_time") || "").trim();
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  },

  setSessionStartTime() {
    setCookie("session_start_time", String(Date.now()), {
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
  },

  setSession({ access_token, refresh_token, csrf_token }) {
    this.setAccessToken(access_token);
    this.setRefreshToken(refresh_token);
    this.setCsrfToken(csrf_token);
    this.setSessionStartTime();
  },

  getCsrfToken() {
    if (this.csrfToken) return this.csrfToken;

    const token = getFirstCookieValue(CSRF_COOKIE_KEYS);
    if (!token) return null;

    this.csrfToken = token;
    return token;
  },

  setCsrfToken(token) {
    const safeToken = String(token || "").trim();
    this.csrfToken = safeToken || null;

    if (safeToken) {
      setCookie("csrf_token", safeToken, { maxAge: CSRF_TOKEN_MAX_AGE, path: "/" });
      setCookie("csrf-token", safeToken, { maxAge: CSRF_TOKEN_MAX_AGE, path: "/" });
      setCookie("XSRF-TOKEN", safeToken, { maxAge: CSRF_TOKEN_MAX_AGE, path: "/" });
      return;
    }

    removeCookie("csrf_token");
    removeCookie("csrf-token");
    removeCookie("XSRF-TOKEN");
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
