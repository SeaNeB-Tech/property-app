import axios from "axios";
import { API_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getAuthAppUrl } from "@/lib/core/appUrls";
import { getCookie as getCookieShared } from "@/lib/auth/cookieManager";
import { setAuthFlowContext } from "@/lib/auth/flowContext";
import { authStore } from "@/app/auth/auth-service/store/authStore";
import { clearAuthFailureArtifacts, notifyAuthChanged } from "@/services/auth.service";

const REFRESH_ENDPOINT = "/auth/refresh";
const DEFAULT_PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
const AUTH_DEBUG =
  String(process.env.NEXT_PUBLIC_AUTH_DEBUG || "").trim().toLowerCase() === "true";

const logAuthDebug = (...args) => {
  if (!AUTH_DEBUG || typeof console === "undefined") return;
  console.debug(...args);
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REFRESH_TIMEOUT_MS = toPositiveNumber(
  process.env.NEXT_PUBLIC_AUTH_REFRESH_TIMEOUT_MS,
  7000
);

axios.defaults.headers.common["x-product-key"] = DEFAULT_PRODUCT_KEY;
axios.defaults.withCredentials = true;

let inMemoryCsrfToken = "";
let inMemoryAccessToken = "";
let refreshPromise = null;

const TRANSIENT_BACKEND_STATUSES = new Set([500, 502, 503, 504, 522, 524]);
const CSRF_COOKIE_NAMES = [
  "csrf_token_property",
  "csrf_token",
  "csrfToken",
  "csrf-token",
  "XSRF-TOKEN",
  "xsrf-token",
  "XSRF_TOKEN",
  "_csrf",
];
const REFRESH_COOKIE_NAMES = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
  "refreshtoken",
];
const ACCESS_COOKIE_NAMES = ["access_token", "accessToken", "access_token_property"];
const SESSION_COOKIE_NAMES = ["auth_session", "auth_session_start", "auth_redirect_in_progress"];
const AUTH_COOKIE_NAMES = Array.from(
  new Set([
    ...CSRF_COOKIE_NAMES,
    ...REFRESH_COOKIE_NAMES,
    ...ACCESS_COOKIE_NAMES,
    ...SESSION_COOKIE_NAMES,
  ])
);

/* -----------------------------
   MULTI TAB TOKEN SYNC
----------------------------- */

let authChannel = null;

const AUTH_CHANNEL_NAME = "auth_channel";
const AUTH_CHANNEL_EVENTS = {
  accessTokenUpdated: "access_token_updated",
  csrfUpdated: "csrf_updated",
};

const AUTH_CHANNEL_ACCESS_TYPES = new Set([
  AUTH_CHANNEL_EVENTS.accessTokenUpdated,
  "ACCESS_TOKEN_UPDATED",
  "acces_token_updated",
]);

const AUTH_CHANNEL_CSRF_TYPES = new Set([
  AUTH_CHANNEL_EVENTS.csrfUpdated,
  "CSRF_UPDATED",
]);

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);

  authChannel.onmessage = (event) => {
    const data = event?.data || {};
    const type = String(data?.type || "").trim();
    let didUpdate = false;

    if (AUTH_CHANNEL_ACCESS_TYPES.has(type)) {
      const nextToken = String(data?.token ?? "").trim();
      if (nextToken !== inMemoryAccessToken) {
        inMemoryAccessToken = nextToken;
        didUpdate = true;
      }
    }

    if (AUTH_CHANNEL_CSRF_TYPES.has(type)) {
      const nextToken = String(data?.token ?? "").trim();
      if (nextToken !== inMemoryCsrfToken) {
        inMemoryCsrfToken = nextToken;
        didUpdate = true;
      }
    }

    if (didUpdate) {
      notifyAuthChanged();
    }
  };
}

const broadcastAuthUpdate = (type, token) => {
  try {
    authChannel?.postMessage({ type, token });
  } catch {}
};

/* -----------------------------
   COOKIE HELPERS
----------------------------- */

const getFirstCookieValue = (names = []) => {
  for (const name of names) {
    const value = String(getCookieShared(name) || "").trim();
    if (value) return value;
  }
  return "";
};

const getCsrfToken = () =>
  String(getFirstCookieValue(CSRF_COOKIE_NAMES) || inMemoryCsrfToken || "").trim();

const getAccessToken = () => String(inMemoryAccessToken || "").trim();

const setCsrfTokenInMemory = (token) => {
  inMemoryCsrfToken = String(token || "").trim();
  broadcastAuthUpdate(AUTH_CHANNEL_EVENTS.csrfUpdated, inMemoryCsrfToken);
};

const setAccessTokenInMemory = (token) => {
  inMemoryAccessToken = String(token || "").trim();
  broadcastAuthUpdate(AUTH_CHANNEL_EVENTS.accessTokenUpdated, inMemoryAccessToken);
};

/* -----------------------------
   HYDRATE AUTH SESSION
----------------------------- */

export const hydrateAuthSession = ({
  accessToken = "",
  csrfToken = "",
  broadcast = true,
} = {}) => {
  const nextAccess = String(accessToken || "").trim();
  const nextCsrf = String(csrfToken || "").trim();

  if (nextAccess) {
    setAccessTokenInMemory(nextAccess);
    authStore?.setAccessToken?.(nextAccess);
  }

  if (nextCsrf) {
    setCsrfTokenInMemory(nextCsrf);
    authStore?.setCsrfToken?.(nextCsrf);
  }

  if (broadcast && (nextAccess || nextCsrf)) {
    notifyAuthChanged();
  }

  return {
    accessToken: nextAccess || getAccessToken(),
    csrfToken: nextCsrf || getCsrfToken(),
  };
};

/* -----------------------------
   SECURITY HELPERS
----------------------------- */

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

const shouldRetryRefresh = (error) => {
  const status = Number(error?.response?.status || 0);
  if (!error?.response) return true;
  return TRANSIENT_BACKEND_STATUSES.has(status) || status === 429;
};

/* -----------------------------
   REDIRECT
----------------------------- */

const redirectToAuthLogin = () => {
  if (typeof window === "undefined") return;

  const currentUrl = new URL(window.location.href);
  const returnTo = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

  const sourceFromQuery = String(currentUrl.searchParams.get("source") || "")
    .trim()
    .toLowerCase();

  const isBusinessRegisterRoute =
    currentUrl.pathname.startsWith("/auth/business-register");

  const source = sourceFromQuery || (isBusinessRegisterRoute ? "main-app-register" : "");

  setAuthFlowContext({ source, returnTo });
  window.location.href = getAuthAppUrl("/auth/login");
};

/* -----------------------------
   UNAUTHORIZED HANDLING
----------------------------- */

const isAuthRoute = () => {
  if (typeof window === "undefined") return false;
  const path = String(window.location.pathname || "");
  return path.startsWith("/auth");
};

const getAuthCookieDomains = () => {
  if (typeof window === "undefined") return [""];
  const configuredDomain = String(process.env.NEXT_PUBLIC_COOKIE_DOMAIN || "").trim();
  const host = String(window.location.hostname || "").toLowerCase();
  const maybeParentDomain = host.includes(".")
    ? `.${host.split(".").slice(-2).join(".")}`
    : "";
  return Array.from(new Set(["", configuredDomain, maybeParentDomain].filter(Boolean)));
};

const expireCookie = (name, domain = "") => {
  if (typeof document === "undefined") return;
  const isSecure = window.location.protocol === "https:";
  const sameSite = isSecure ? "; SameSite=None" : "";
  const secure = isSecure ? "; Secure" : "";
  const base = `${encodeURIComponent(name)}=; path=/; max-age=0${sameSite}`;
  const domainAttr = domain ? `; domain=${domain}` : "";
  document.cookie = `${base}${domainAttr}${secure}`;
};

const expireAuthCookies = () => {
  if (typeof document === "undefined") return;
  const domains = getAuthCookieDomains();
  for (const name of AUTH_COOKIE_NAMES) {
    for (const domain of domains) {
      expireCookie(name, domain);
    }
  }
};

const clearStoredAccessToken = () => {
  if (typeof window === "undefined") return;
  const keys = ["access_token", "property:volatile:access_token"];
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  }
};

const resetAuthSession = ({ clearCookies = true, broadcast = true } = {}) => {
  const canUseAuthService =
    clearCookies && typeof clearAuthFailureArtifacts === "function";

  if (canUseAuthService) {
    clearAuthFailureArtifacts();
  } else {
    authStore?.clearAll?.();
    clearInMemoryAccessToken();
    authStore?.setRefreshToken?.("");
  }

  clearStoredAccessToken();

  if (clearCookies) {
    // HttpOnly cookies are cleared by the backend via Set-Cookie Max-Age=0.
    expireAuthCookies();
  }

  if (broadcast && !canUseAuthService) {
    notifyAuthChanged();
  }
};

export const handleUnauthorizedResponse = (
  errorOrResponse,
  { redirect = false, skipIfAuthRoute = true, onUnauthorized } = {}
) => {
  const status = Number(errorOrResponse?.response?.status || errorOrResponse?.status || 0);
  if (status !== 401) return false;

  logAuthDebug("[auth] unauthorized response: clearing auth state", {
    redirect: Boolean(redirect),
  });

  resetAuthSession();

  if (typeof onUnauthorized === "function") {
    try {
      onUnauthorized();
    } catch {}
  }

  if (redirect && !(skipIfAuthRoute && isAuthRoute())) {
    redirectToAuthLogin();
  }

  return true;
};

/* -----------------------------
   TOKEN EXTRACTION
----------------------------- */

const readCsrfTokenFromResponse = (response) => {
  const data = response?.data || {};

  return String(
    data?.csrf_token_property ||
      data?.csrf_token ||
      data?.csrfToken ||
      response?.headers?.["x-csrf-token"] ||
      ""
  ).trim();
};

const readAccessTokenFromResponse = (response) => {
  const data = response?.data || {};
  const headerAuth = String(response?.headers?.["authorization"] || "").trim();

  const headerToken = /^Bearer\s+/i.test(headerAuth)
    ? headerAuth.replace(/^Bearer\s+/i, "").trim()
    : headerAuth;

  return String(
    data?.access_token ||
      data?.accessToken ||
      data?.token ||
      data?.jwt ||
      headerToken ||
      ""
  ).trim();
};

/* -----------------------------
   AXIOS CLIENTS
----------------------------- */

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

/* -----------------------------
   REFRESH TOKEN
----------------------------- */

export const refreshAccessToken = async () => {
  const csrfToken = getCsrfToken();
  const csrfHeaderValue = String(csrfToken || "").trim();

  const config = {
    timeout: REFRESH_TIMEOUT_MS,
    withCredentials: true,
    headers: {
      "x-product-key": DEFAULT_PRODUCT_KEY,
      "x-csrf-token": csrfHeaderValue,
      "x-xsrf-token": csrfHeaderValue,
      "csrf-token": csrfHeaderValue,
    },
  };

  delete refreshClient.defaults.headers.common["Authorization"];

  const applyRefreshResponse = (response) => {
    const newAccessToken = readAccessTokenFromResponse(response);
    const newCsrfToken = readCsrfTokenFromResponse(response);
    hydrateAuthSession({
      accessToken: newAccessToken,
      csrfToken: newCsrfToken,
      broadcast: true,
    });

    return true;
  };

  try {
    logAuthDebug("[auth] refreshAccessToken: start", {
      hasCsrfHeader: Boolean(csrfHeaderValue),
    });
    const response = await refreshClient.post(
      REFRESH_ENDPOINT,
      { product_key: DEFAULT_PRODUCT_KEY },
      config
    );

    return applyRefreshResponse(response);
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    logAuthDebug("[auth] refreshAccessToken failed", {
      status,
      message: error?.message || "unknown_error",
    });

    if (status === 401 || status === 403) {
      await new Promise((r) => setTimeout(r, 120));
      try {
        const retry = await refreshClient.post(
          REFRESH_ENDPOINT,
          { product_key: DEFAULT_PRODUCT_KEY },
          config
        );
        return applyRefreshResponse(retry);
      } catch (retryError) {
        handleUnauthorizedResponse(retryError, { redirect: true });
        throw retryError;
      }
    }

    throw error;
  }
};

/* -----------------------------
   SAFE REFRESH WRAPPER
----------------------------- */

const refreshAccessTokenWithRetry = async () => {
  try {
    return await refreshAccessToken();
  } catch (err) {
    if (!shouldRetryRefresh(err)) throw err;
    throw err;
  }
};

/* -----------------------------
   ENSURE ACCESS TOKEN
----------------------------- */

export const ensureAccessToken = async () => {
  if (getAccessToken()) return true;

  if (!refreshPromise) {
    refreshPromise = refreshAccessTokenWithRetry().finally(() => {
      refreshPromise = null;
    });
  }

  try {
    await refreshPromise;
    return Boolean(getAccessToken());
  } catch {
    return false;
  }
};

/* -----------------------------
   MAIN API REQUEST
----------------------------- */

export const apiRequest = async (config = {}) => {
  const nextConfig = { ...config };

  nextConfig.withCredentials = true;
  nextConfig.headers = stripAuthorizationHeader({ ...(config?.headers || {}) });

  const requiresAuth = nextConfig?.requireAuth === true;

  if (requiresAuth && !getAccessToken()) {
    await ensureAccessToken();
  }

  const csrfToken = getCsrfToken();
  const accessToken = getAccessToken();

  if (csrfToken) {
    nextConfig.headers["x-csrf-token"] = csrfToken;
    nextConfig.headers["x-xsrf-token"] = csrfToken;
  }

  if (accessToken) {
    nextConfig.headers.authorization = `Bearer ${accessToken}`;
  }

  nextConfig.headers["x-product-key"] = DEFAULT_PRODUCT_KEY;

  return api.request(nextConfig);
};

/* -----------------------------
   AUTH API HELPERS
----------------------------- */

export const authApi = {
  get: (url, config = {}) =>
    apiRequest({ ...config, method: "get", url, requireAuth: true }),

  post: (url, data, config = {}) =>
    apiRequest({ ...config, method: "post", url, data, requireAuth: true }),

  put: (url, data, config = {}) =>
    apiRequest({ ...config, method: "put", url, data, requireAuth: true }),

  patch: (url, data, config = {}) =>
    apiRequest({ ...config, method: "patch", url, data, requireAuth: true }),

  delete: (url, config = {}) =>
    apiRequest({ ...config, method: "delete", url, requireAuth: true }),
};

/* -----------------------------
   RESPONSE INTERCEPTOR
----------------------------- */

api.interceptors.response.use(
  (response) => {
    const accessToken = readAccessTokenFromResponse(response);
    const csrfToken = readCsrfTokenFromResponse(response);
    hydrateAuthSession({
      accessToken,
      csrfToken,
      broadcast: false,
    });

    return response;
  },
  async (error) => {
    const originalRequest = error?.config || {};
    const status = Number(error?.response?.status || 0);
    const skipAuthRedirect = Boolean(originalRequest?.skipAuthRedirect);

    if (status !== 401) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      handleUnauthorizedResponse(error, {
        redirect: !skipAuthRedirect,
        skipIfAuthRoute: true,
      });
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessTokenWithRetry().finally(() => {
          refreshPromise = null;
        });
      }

      await refreshPromise;
      return api(originalRequest);
    } catch (refreshError) {
      handleUnauthorizedResponse(refreshError, {
        redirect: !skipAuthRedirect,
        skipIfAuthRoute: true,
      });

      return Promise.reject(refreshError);
    }
  }
);

/* -----------------------------
   EXPORT HELPERS
----------------------------- */

export const clearInMemoryAccessToken = () => {
  setAccessTokenInMemory("");
  setCsrfTokenInMemory("");
  authStore?.setAccessToken?.("");
  authStore?.setCsrfToken?.("");
};

export const setInMemoryAccessToken = (token) => setAccessTokenInMemory(token);

export const getInMemoryAccessToken = () =>
  String(inMemoryAccessToken || "").trim();

export const setInMemoryCsrfToken = (token) => setCsrfTokenInMemory(token);

export const getInMemoryCsrfToken = () =>
  String(inMemoryCsrfToken || "").trim();

export default api;
