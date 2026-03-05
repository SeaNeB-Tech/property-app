import axios from "axios";
import { API_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getAuthAppUrl } from "@/lib/core/appUrls";
import { getCookie as getCookieShared } from "@/lib/auth/cookieManager";

const REFRESH_ENDPOINT = "/auth/refresh";
const DEFAULT_PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";

axios.defaults.headers.common["x-product-key"] = DEFAULT_PRODUCT_KEY;
axios.defaults.withCredentials = true;

let inMemoryCsrfToken = "";
let refreshPromise = null;
const TRANSIENT_BACKEND_STATUSES = new Set([500, 502, 503, 504, 522, 524]);
const CSRF_COOKIE_NAMES = ["csrf_token_property"];

const stripAuthorizationHeader = (headers) => {
  if (!headers) return headers;
  if (typeof headers.delete === "function") {
    headers.delete("Authorization");
    headers.delete("authorization");
    return headers;
  }

  const nextHeaders = { ...headers };
  delete nextHeaders.Authorization;
  delete nextHeaders.authorization;
  return nextHeaders;
};

const getFirstCookieValue = (names = []) => {
  for (const name of names) {
    const value = String(getCookieShared(name) || "").trim();
    if (value) return value;
  }
  return "";
};

const getCsrfToken = () =>
  String(
    getFirstCookieValue(CSRF_COOKIE_NAMES) || inMemoryCsrfToken || ""
  ).trim();
const getProductKey = () => {
  return DEFAULT_PRODUCT_KEY;
};

const setCsrfTokenInMemory = (token) => {
  inMemoryCsrfToken = String(token || "").trim();
};

const shouldInvalidateClientSession = (error) => {
  const status = Number(error?.response?.status || 0);
  return status === 401 || status === 403;
};

const isInvalidRefreshSession = (error) => {
  const status = Number(error?.response?.status || error?.status || 0);
  return status === 401;
};

const shouldRetryRefresh = (error) => {
  const status = Number(error?.response?.status || 0);
  if (!error?.response) return true;
  return TRANSIENT_BACKEND_STATUSES.has(status) || status === 429;
};

const redirectToAuthLogin = () => {
  if (typeof window === "undefined") return;
  const currentUrl = new URL(window.location.href);
  const returnTo = encodeURIComponent(`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  const sourceFromQuery = String(currentUrl.searchParams.get("source") || "").trim().toLowerCase();
  const isBusinessRegisterRoute = currentUrl.pathname.startsWith("/auth/business-register");
  const source = sourceFromQuery || (isBusinessRegisterRoute ? "main-app-register" : "");

  const loginPath = source
    ? `/auth/login?source=${encodeURIComponent(source)}&returnTo=${returnTo}`
    : `/auth/login?returnTo=${returnTo}`;

  window.location.href = getAuthAppUrl(loginPath);
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
    "x-product-key": DEFAULT_PRODUCT_KEY,
  },
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-product-key": DEFAULT_PRODUCT_KEY,
  },
});

const shouldAttemptBackendFailover = (error, originalConfig = {}) => {
  // Browser must keep auth requests on same-origin /api so same-origin cookies are sent.
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

export const refreshAccessToken = async () => {
  const productKey = getProductKey();
  const csrfToken = getCsrfToken();

  let lastError = null;
  const requestConfig = {
    timeout: 7000,
    withCredentials: true,
    credentials: "include",
  };
  const buildHeaders = ({ includeCsrf = true } = {}) => ({
    "x-product-key": productKey,
    ...(includeCsrf && csrfToken ? { "x-csrf-token": csrfToken } : {}),
  });
  const runRefreshAttempt = async ({ includeCsrf = true } = {}) =>
    refreshClient.post(
      REFRESH_ENDPOINT,
      { product_key: productKey },
      {
        ...requestConfig,
        headers: buildHeaders({ includeCsrf }),
      }
    );
  const applyRefreshResponse = (response) => {
    const nextCsrfToken = readCsrfTokenFromResponse(response);
    if (nextCsrfToken) setCsrfTokenInMemory(nextCsrfToken);
    return true;
  };

  try {
    const primary = await runRefreshAttempt({ includeCsrf: true });
    return applyRefreshResponse(primary);
  } catch (err) {
    lastError = err;

    // CSRF may be stale immediately after OTP/login handoff.
    const status = Number(lastError?.response?.status || 0);
    if (csrfToken && (status === 401 || status === 403)) {
      try {
        const responseWithoutCsrf = await runRefreshAttempt({ includeCsrf: false });
        return applyRefreshResponse(responseWithoutCsrf);
      } catch (withoutCsrfErr) {
        lastError = withoutCsrfErr;
      }
    }

    try {
      const response = await retryWithBackendFailover(refreshClient, lastError);
      return applyRefreshResponse(response);
    } catch (fallbackErr) {
      lastError = fallbackErr;
    }
  }

  if (shouldInvalidateClientSession(lastError)) {
    // Only clear on explicit auth-invalid responses.
    setCsrfTokenInMemory("");
  }

  throw lastError || new Error("Refresh failed");
};

const refreshAccessTokenWithRetry = async () => {
  try {
    return await refreshAccessToken();
  } catch (err) {
    if (!shouldRetryRefresh(err)) throw err;
    throw err;
  }
};

export const ensureAccessToken = async () => {
  const csrfHint = getCsrfToken();
  if (csrfHint) return true;
  try {
    await refreshAccessTokenWithRetry();
    return true;
  } catch {
    return false;
  }
};

export const apiRequest = async (config = {}) => {
  const nextConfig = { ...config };
  nextConfig.withCredentials = true;
  nextConfig.credentials = "include";
  nextConfig.headers = stripAuthorizationHeader({ ...(config?.headers || {}) });

  const csrfToken = getCsrfToken();
  const productKey = getProductKey();

  if (csrfToken && !nextConfig.headers["x-csrf-token"]) {
    nextConfig.headers["x-csrf-token"] = csrfToken;
  }
  nextConfig.headers["x-product-key"] = productKey;

  return api.request(nextConfig);
};

export const authApi = {
  get: (url, config = {}) => apiRequest({ ...config, method: "get", url, requireAuth: true }),
  post: (url, data, config = {}) =>
    apiRequest({ ...config, method: "post", url, data, requireAuth: true }),
  put: (url, data, config = {}) =>
    apiRequest({ ...config, method: "put", url, data, requireAuth: true }),
  patch: (url, data, config = {}) =>
    apiRequest({ ...config, method: "patch", url, data, requireAuth: true }),
  delete: (url, config = {}) => apiRequest({ ...config, method: "delete", url, requireAuth: true }),
};

api.interceptors.request.use((config) => {
  config.withCredentials = true;
  config.credentials = "include";
  config.headers = stripAuthorizationHeader(config.headers || {});

  const csrfToken = getCsrfToken();
  const productKey = getProductKey();

  if (csrfToken) config.headers["x-csrf-token"] = csrfToken;
  config.headers["x-product-key"] = productKey;

  return config;
});

api.interceptors.response.use(
  (response) => {
    const nextCsrfToken = readCsrfTokenFromResponse(response);
    if (nextCsrfToken) setCsrfTokenInMemory(nextCsrfToken);
    return response;
  },
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
        refreshPromise = refreshAccessTokenWithRetry().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      originalRequest.withCredentials = true;
      originalRequest.credentials = "include";
      return api(originalRequest);
    } catch (refreshError) {
      if (shouldInvalidateClientSession(refreshError)) setCsrfTokenInMemory("");
      if (originalRequest?.requireAuth && isInvalidRefreshSession(refreshError)) {
        redirectToAuthLogin();
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;
export const clearInMemoryAccessToken = () => {
  setCsrfTokenInMemory("");
};
export const setInMemoryAccessToken = () => "";
export const getInMemoryAccessToken = () => "";
export const setInMemoryCsrfToken = (token) => setCsrfTokenInMemory(token);
export const getInMemoryCsrfToken = () => String(inMemoryCsrfToken || "").trim();

