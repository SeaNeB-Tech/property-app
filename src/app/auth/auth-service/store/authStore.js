"use client";

import { getCookie, removeCookie, setCookie } from "@/services/cookie";

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
  "access_token_issued_time",
  "session_start_time",
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

  getAccessToken() {
    return this.accessToken || null;
  },

  setAccessToken(token) {
    const safeToken = String(token || "").trim();
    this.accessToken = safeToken || null;

    if (safeToken) {
      setCookie("access_token_issued_time", String(Date.now()), {
        maxAge: SESSION_MAX_AGE,
        path: "/",
      });
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("auth_redirect_in_progress");
        }
      } catch {}
      return;
    }

    removeCookie("access_token_issued_time");
  },

  getRefreshToken() {
    return this.refreshToken || null;
  },

  setRefreshToken(token) {
    const safeToken = String(token || "").trim();
    this.refreshToken = safeToken || null;
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
    const cookieToken = String(getCookie("csrf_token_property") || "").trim();
    return cookieToken || null;
  },

  setCsrfToken() {},

  clearAll() {
    this.accessToken = null;
    this.refreshToken = null;
    AUTH_COOKIE_KEYS.forEach((key) => removeCookie(key));
  },

  dumpAuthState() {
    const cookies = parseCookies();
    const getLength = (value) => (value ? String(value).length : 0);

    console.log("[authStore] Snapshot", {
      memory: {
        accessToken: getLength(this.accessToken),
        refreshToken: getLength(this.refreshToken),
        csrfToken: 0,
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
