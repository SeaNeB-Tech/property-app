import axios from "axios";
import { API_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/apiBaseUrl";
import { getAuthAppUrl } from "@/lib/appUrls";

const REFRESH_ENDPOINT = "/auth/refresh";
const DEFAULT_PRODUCT_KEY = "property";

let inMemoryAccessToken = "";
let inMemoryCsrfToken = "";
let refreshPromise = null;
const TRANSIENT_BACKEND_STATUSES = new Set([500, 502, 503, 504, 522, 524]);

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
    if (key === name) return value;
  }
  return "";
};

const getCsrfToken = () =>
  String(
    getCookie("csrf_token_property") || inMemoryCsrfToken || ""
  ).trim();
const getAccessToken = () => String(inMemoryAccessToken || "").trim();
const getProductKey = () =>
  (String(getCookie("product_key") || "").trim().toLowerCase() || DEFAULT_PRODUCT_KEY);

const setAccessTokenInMemory = (token) => {
  inMemoryAccessToken = String(token || "").trim();
};
const setCsrfTokenInMemory = (token) => {
  inMemoryCsrfToken = String(token || "").trim();
};

const redirectToAuthLogin = () => {
  if (typeof window === "undefined") return;
  const returnTo = encodeURIComponent(window.location.href);
  window.location.href = getAuthAppUrl(`/auth/login?returnTo=${returnTo}`);
};

const readAccessTokenFromResponse = (response) => {
  const data = response?.data || {};
  const fromBody =
    data?.access_token ||
    data?.accessToken ||
    data?.token ||
    data?.jwt ||
    data?.data?.access_token ||
    data?.data?.accessToken ||
    data?.data?.token?.access_token ||
    data?.data?.token?.accessToken ||
    data?.result?.access_token ||
    data?.result?.accessToken ||
    "";

  const headerToken = String(
    response?.headers?.authorization ||
      response?.headers?.Authorization ||
      response?.headers?.["x-access-token"] ||
      ""
  ).trim();

  const fromHeader = /^bearer\s+/i.test(headerToken)
    ? headerToken.replace(/^bearer\s+/i, "").trim()
    : headerToken;

  return String(fromBody || fromHeader || "").trim();
};

const readCsrfTokenFromResponse = (response) => {
  const data = response?.data || {};
  const fromBody =
    data?.csrf_token ||
    data?.csrfToken ||
    data?.data?.csrf_token ||
    data?.data?.csrfToken ||
    data?.result?.csrf_token ||
    data?.result?.csrfToken ||
    "";

  const fromHeader = String(
    response?.headers?.["x-csrf-token"] ||
      response?.headers?.["csrf-token"] ||
      response?.headers?.["x-xsrf-token"] ||
      ""
  ).trim();

  return String(fromBody || fromHeader || "").trim();
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

const shouldAttemptBackendFailover = (error, originalConfig = {}) => {
  // Browser must keep auth requests on same-origin /api so localhost cookies are sent.
  if (typeof window !== "undefined") return false;
  if (originalConfig?._backendFailoverAttempted) return false;
  if (!API_REMOTE_FALLBACK_BASE_URL) return false;
  const status = Number(error?.response?.status || 0);
  const networkFailure = !error?.response;
  return networkFailure || TRANSIENT_BACKEND_STATUSES.has(status);
};

const retryWithBackendFailover = async (client, error) => {
  const originalConfig = error?.config || {};
  if (!shouldAttemptBackendFailover(error, originalConfig)) {
    throw error;
  }

  originalConfig._backendFailoverAttempted = true;
  originalConfig.baseURL = API_REMOTE_FALLBACK_BASE_URL;
  originalConfig.withCredentials = true;
  return client(originalConfig);
};

const refreshAccessToken = async () => {
  const productKey = getProductKey();
  const csrfToken = getCsrfToken();

  let lastError = null;
  const headers = {
    "x-product-key": productKey,
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };

  try {
    const response = await refreshClient.post(
      REFRESH_ENDPOINT,
      { product_key: productKey },
      {
        headers,
        timeout: 7000,
        withCredentials: true,
        credentials: "include",
      }
    );

    const nextAccessToken = readAccessTokenFromResponse(response);
    const nextCsrfToken = readCsrfTokenFromResponse(response);
    if (!nextAccessToken) {
      throw new Error("Refresh failed: no access token returned");
    }

    // Access token is memory-only.
    setAccessTokenInMemory(nextAccessToken);
    if (nextCsrfToken) setCsrfTokenInMemory(nextCsrfToken);
    return true;
  } catch (err) {
    try {
      const response = await retryWithBackendFailover(refreshClient, err);
      const nextAccessToken = readAccessTokenFromResponse(response);
      const nextCsrfToken = readCsrfTokenFromResponse(response);
      if (!nextAccessToken) {
        throw new Error("Refresh failed: no access token returned");
      }
      setAccessTokenInMemory(nextAccessToken);
      if (nextCsrfToken) setCsrfTokenInMemory(nextCsrfToken);
      return true;
    } catch (fallbackErr) {
      lastError = fallbackErr;
    }
  }
  // Prevent repeated refresh loops on stale in-memory tokens.
  setAccessTokenInMemory("");
  throw lastError || new Error("Refresh failed");
};

export const ensureAccessToken = async () => {
  return Boolean(getAccessToken());
};

api.interceptors.request.use((config) => {
  config.withCredentials = true;
  config.headers = config.headers || {};

  const csrfToken = getCsrfToken();
  const accessToken = getAccessToken();
  const productKey = getProductKey();

  if (csrfToken) config.headers["x-csrf-token"] = csrfToken;
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  config.headers["x-product-key"] = config.headers["x-product-key"] || productKey;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config || {};
    const status = Number(error?.response?.status || 0);
    const isRefreshRequest = String(originalRequest?.url || "").includes(REFRESH_ENDPOINT);
    const skipRefresh = originalRequest?.skipRefresh === true;

    if (!isRefreshRequest) {
      try {
        return await retryWithBackendFailover(api, error);
      } catch {
        // Continue with regular auth/401 flow.
      }
    }

    if (status !== 401 || originalRequest._retry || isRefreshRequest || skipRefresh) {
      return Promise.reject(error);
    }

    // Retry only once per failed request.
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
      setAccessTokenInMemory("");
      if (originalRequest?.requireAuth) {
        redirectToAuthLogin();
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;
export const clearInMemoryAccessToken = () => {
  setAccessTokenInMemory("");
  setCsrfTokenInMemory("");
};
export const setInMemoryAccessToken = (token) => setAccessTokenInMemory(token);
export const getInMemoryAccessToken = () => getAccessToken();
export const setInMemoryCsrfToken = (token) => setCsrfTokenInMemory(token);
export const getInMemoryCsrfToken = () => String(inMemoryCsrfToken || "").trim();
