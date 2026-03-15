import { API_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getCookie } from "@/lib/auth/cookieManager";
import {
  clearAccessToken,
} from "@/lib/auth/tokenStorage";
import { handleUnauthorizedResponse, hydrateAuthSession } from "@/lib/api/client";
import { getSessionHint } from "@/lib/auth/sessionHint";
import {
  attachAuthorizationHeader,
  requestWithAuthSafeRetry,
} from "@/lib/auth/apiClientSafe";
import { CSRF_COOKIE_KEYS } from "@/lib/auth/cookieKeys";
import { tryUseRefreshBudget } from "@/lib/auth/refreshBudget";

const normalizeBaseUrl = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const RESOLVED_API_BASE_URL = normalizeBaseUrl(API_BASE_URL || "");

const DEFAULT_PRODUCT_KEY =
  String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() ||
  "property";

const CSRF_COOKIE_CANDIDATES = CSRF_COOKIE_KEYS;

const LOGIN_ENDPOINT = "/auth/login";
const REFRESH_ENDPOINT = "/auth/refresh";
const LOGOUT_ENDPOINT = "/auth/logout";
const ME_ENDPOINT = "/auth/me";
const LOCAL_REFRESH_ENDPOINT = `${String(API_BASE_URL || "").trim().replace(/\/+$/, "") || "/api"}/auth/refresh`;

let _refreshLock = null;
let authFailureHandler = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SSO_LOCK_WAIT_MS = 2000;
const SSO_LOCK_POLL_MS = 50;

const isSsoLockActive = () =>
  typeof window !== "undefined" && Boolean(window.__ACTIVE_SSO_LOCK__);

const waitForSsoLockRelease = async () => {
  if (!isSsoLockActive()) return true;

  const start = Date.now();
  while (isSsoLockActive() && Date.now() - start < SSO_LOCK_WAIT_MS) {
    await sleep(SSO_LOCK_POLL_MS);
  }

  return !isSsoLockActive();
};

/* ---------------------------------------
 URL HELPERS
--------------------------------------- */

const toAbsoluteUrl = (path) => {
  const target = String(path || "").trim();

  if (!target) throw new Error("Missing request path");

  if (/^https?:\/\//i.test(target))
    throw new Error("Absolute auth URLs are not allowed");

  if (!target.startsWith("/"))
    throw new Error(`Path must start with '/': ${target}`);

  return RESOLVED_API_BASE_URL
    ? `${RESOLVED_API_BASE_URL}${target}`
    : target;
};

/* ---------------------------------------
 TOKEN / COOKIE HELPERS
--------------------------------------- */

const getCsrfToken = () => {
  for (const name of CSRF_COOKIE_CANDIDATES) {
    const value = String(getCookie(name) || "").trim();
    if (value) return value;
  }
  return "";
};

const getProductKey = () => DEFAULT_PRODUCT_KEY;

/* ---------------------------------------
 HEADER BUILDER
--------------------------------------- */

const buildHeaders = ({ headers, includeCsrf = true }) => {
  const next = attachAuthorizationHeader(headers);

  if (!next.has("Content-Type")) {
    next.set("Content-Type", "application/json");
  }

  next.set("x-product-key", getProductKey());

  const csrf = getCsrfToken();

  if (includeCsrf && csrf) {
    if (!next.has("x-csrf-token")) next.set("x-csrf-token", csrf);
    if (!next.has("x-xsrf-token")) next.set("x-xsrf-token", csrf);
    if (!next.has("csrf-token")) next.set("csrf-token", csrf);
  }

  return next;
};

/* ---------------------------------------
 AUTH FAILURE HANDLING
--------------------------------------- */

const triggerAuthFailure = async (responseOrError) => {
  clearAccessToken();
  handleUnauthorizedResponse(responseOrError || { status: 401 }, { redirect: true });

  if (typeof authFailureHandler === "function") {
    await authFailureHandler();
  }
};

export const setAuthFailureHandler = (handler) => {
  authFailureHandler = typeof handler === "function" ? handler : null;
};

/* ---------------------------------------
 REFRESH SESSION
--------------------------------------- */

const shouldRetryRefresh = (responseOrError) => {
  const status = Number(
    responseOrError?.response?.status ||
      responseOrError?.status ||
      0
  );

  if (!status) return true;

  return status === 429 || status >= 500;
};

const extractAccessToken = (payload) => {
  return String(
    payload?.accessToken ||
      payload?.access_token ||
      payload?.data?.accessToken ||
      payload?.data?.access_token ||
      payload?.token ||
      ""
  ).trim();
};

const extractCsrfToken = (payload) => {
  return String(
    payload?.csrfToken ||
      payload?.csrf_token ||
      payload?.data?.csrfToken ||
      payload?.data?.csrf_token ||
      ""
  ).trim();
};

const executeRefresh = async () => {
  const productKey = getProductKey();
  const sessionHint = await getSessionHint();
  if (!sessionHint?.hasRefreshSession) {
    return false;
  }

  const refreshBudget = tryUseRefreshBudget({ source: "auth-api-client" });
  if (!refreshBudget.allowed) {
    return false;
  }

  const lockReleased = await waitForSsoLockRelease();
  if (!lockReleased) {
    console.warn("[auth] refresh skipped: sso exchange in progress");
    return false;
  }

  const response = await fetch(LOCAL_REFRESH_ENDPOINT, {
    method: "POST",
    headers: buildHeaders({ includeCsrf: true }),
    credentials: "include",
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify({ product_key: productKey }),
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const status = Number(response.status || 0);
    if (status === 401 || status === 403) {
      clearAccessToken();
    } else if (!status) {
      console.warn(
        "[auth] token refresh interrupted by page reload. Tokens preserved."
      );
    } else if (status >= 500) {
      console.warn("[auth] server error during refresh. Tokens preserved.");
    }
    return false;
  }

  const accessToken = extractAccessToken(payload);
  const csrfToken = extractCsrfToken(payload);

  if (accessToken || csrfToken) {
    hydrateAuthSession({ accessToken, csrfToken, broadcast: true });
  }

  return true;
};

const executeRefreshWithRetry = async () => {
  try {
    return await executeRefresh();
  } catch (err) {
    if (!shouldRetryRefresh(err)) return false;

    await new Promise((r) => setTimeout(r, 150));

    try {
      return await executeRefresh();
    } catch (retryErr) {
      const status = Number(
        retryErr?.response?.status || retryErr?.status || 0
      );
      if (!status || retryErr?.name === "AbortError") {
        console.warn(
          "[auth] token refresh interrupted by page reload. Tokens preserved."
        );
      } else if (status >= 500) {
        console.warn("[auth] server error during refresh. Tokens preserved.");
      }
      return false;
    }
  }
};

export const refreshSession = async () => {
  if (!_refreshLock) {
    _refreshLock = executeRefreshWithRetry().finally(() => {
      _refreshLock = null;
    });
  }

  return _refreshLock;
};

/* ---------------------------------------
 CORE API REQUEST
--------------------------------------- */

export const apiRequest = async (
  path,
  options = {},
  control = {}
) => {
  const method = String(options.method || "GET").toUpperCase();

  let hasRetried401 = control._retry === true;

  const retryOn401 =
    control.retryOn401 !== false && !hasRetried401;

  const isRefreshRequest = String(path || "") === REFRESH_ENDPOINT;

  const execute = async () => {
    return fetch(toAbsoluteUrl(path), {
      ...options,
      method,
      headers: buildHeaders({
        headers: options.headers,
      }),
      credentials: "include",
      cache: options.cache || "no-store",
    });
  };

  const response = await requestWithAuthSafeRetry({
    makeRequest: execute,
    retryOn401,
    isRefreshRequest,
    refresh: refreshSession,
    markRetried: () => {
      hasRetried401 = true;
    },
  });

  if (response.status !== 401 || !retryOn401 || isRefreshRequest || String(path || "") === ME_ENDPOINT) {
    return response;
  }

  await triggerAuthFailure(response);

  return response;
};

/* ---------------------------------------
 JSON HELPER
--------------------------------------- */

export const apiJson = async (path, options = {}, control = {}) => {
  const response = await apiRequest(path, options, control);

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
};

/* ---------------------------------------
 AUTH API
--------------------------------------- */

export const authApi = {
  login: (credentials) => {
    const productKey = getProductKey();

    return apiJson(
      LOGIN_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify({
          ...(credentials || {}),
          product_key: productKey,
        }),
      },
      { retryOn401: false }
    );
  },

  me: (control = {}) =>
    apiJson(ME_ENDPOINT, { method: "GET" }, control),

  logout: async () => {
    const productKey = getProductKey();

    const result = await apiJson(
      LOGOUT_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify({ product_key: productKey }),
      },
      { retryOn401: false }
    );

    clearAccessToken();

    return result;
  },
};

/* ---------------------------------------
 SAFE MODE LOG
--------------------------------------- */

if (
  typeof globalThis !== "undefined" &&
  !globalThis.__SEANEB_AUTH_SAFE_MODE_API_CLIENT_FA__
) {
  globalThis.__SEANEB_AUTH_SAFE_MODE_API_CLIENT_FA__ = true;
  console.info("[AUTH SAFE MODE] using shared auth layer");
}
