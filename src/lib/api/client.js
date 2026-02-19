import axios from "axios";
import { API_BASE_URL } from "@/lib/apiBaseUrl";
import { getAuthAppUrl } from "@/lib/appUrls";

const REFRESH_ENDPOINT = "/auth/refresh";
const DEFAULT_PRODUCT_KEY = "property";

const getCookieEntries = () => {
  if (typeof document === "undefined") return [];
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  return cookies
    .map((entry) => {
      const idx = entry.indexOf("=");
      if (idx < 0) return null;
      const key = decodeURIComponent(entry.slice(0, idx));
      const value = decodeURIComponent(entry.slice(idx + 1));
      return { key, value };
    })
    .filter(Boolean);
};

const getCookie = (name) => {
  const entries = getCookieEntries();
  for (const { key, value } of entries) {
    if (key !== name) continue;
    return value;
  }
  return "";
};

const getCookieByPrefixes = (prefixes = []) => {
  const entries = getCookieEntries();
  for (const { key, value } of entries) {
    const lowerKey = key.toLowerCase();
    if (prefixes.some((prefix) => lowerKey === prefix || lowerKey.startsWith(`${prefix}_`))) {
      if (String(value || "").trim()) return value;
    }
  }
  return "";
};

const getCsrfToken = () =>
  (
    getCookie("csrf_token") ||
    getCookieByPrefixes(["csrf_token"]) ||
    getCookie("csrf-token") ||
    getCookieByPrefixes(["csrf-token"]) ||
    getCookie("XSRF-TOKEN") ||
    getCookieByPrefixes(["xsrf-token"]) ||
    getCookie("XSRF_TOKEN") ||
    getCookie("xsrf-token") ||
    getCookie("_csrf") ||
    ""
  ).trim();

const getAccessToken = () =>
  (getCookie("access_token") || getCookieByPrefixes(["access_token"]) || "").trim();

const getProductKey = () =>
  (getCookie("product_key") || DEFAULT_PRODUCT_KEY).trim().toLowerCase() || DEFAULT_PRODUCT_KEY;

const getRefreshToken = () =>
  (getCookie("refresh_token") || getCookieByPrefixes(["refresh_token"]) || getCookie("refresh-token") || "").trim();

const redirectToAuthLogin = () => {
  if (typeof window === "undefined") return;
  const returnTo = encodeURIComponent(window.location.href);
  window.location.href = getAuthAppUrl(`/auth/login?returnTo=${returnTo}`);
};

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

let refreshPromise = null;

const refreshAccessToken = async () => {
  const csrfToken = getCsrfToken();
  const productKey = getProductKey();
  const refreshToken = getRefreshToken();
  const headers = {};
  const baseBody = { product_key: productKey };

  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
    headers["csrf-token"] = csrfToken;
  }
  headers["x-product-key"] = productKey;

  const attempts = [];
  if (refreshToken) attempts.push({ ...baseBody, refresh_token: refreshToken });
  attempts.push(baseBody);
  attempts.push({});

  let lastError = null;
  for (const body of attempts) {
    try {
      await refreshClient.post(REFRESH_ENDPOINT, body, { headers });
      return true;
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status || 0);
      if (status === 401) throw error;
    }
  }

  throw lastError || new Error("Refresh failed");
  return true;
};

export const ensureAccessToken = async () => {
  if (getAccessToken()) return true;
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
};

api.interceptors.request.use((config) => {
  config.withCredentials = true;
  config.headers = config.headers || {};

  const csrfToken = getCsrfToken();
  const accessToken = getAccessToken();
  const productKey = getProductKey();
  if (csrfToken) {
    config.headers["x-csrf-token"] = csrfToken;
    config.headers["csrf-token"] = csrfToken;
  }
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  config.headers["x-product-key"] = config.headers["x-product-key"] || productKey;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config || {};
    const status = Number(error?.response?.status || 0);
    const isRefreshRequest = String(originalRequest?.url || "").includes(REFRESH_ENDPOINT);

    if (status !== 401 || originalRequest._retry || isRefreshRequest) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      await refreshPromise;
      originalRequest.withCredentials = true;
      return api(originalRequest);
    } catch (refreshError) {
      redirectToAuthLogin();
      return Promise.reject(refreshError);
    }
  }
);

export default api;
