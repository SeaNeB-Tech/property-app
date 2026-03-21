import {
  getInMemoryAccessToken,
  getInMemoryCsrfToken,
  hydrateAuthSession,
} from "@/lib/api/client";

import { clearAccessToken, getAccessToken, getCsrfToken } from "@/lib/auth/tokenStorage";
import { getSessionHint } from "@/lib/auth/sessionHint";
import { CSRF_COOKIE_KEYS } from "@/lib/auth/cookieKeys";
import { clearRefreshBudget, tryUseRefreshBudget } from "@/lib/auth/refreshBudget";
import { API_BASE_URL } from "@/lib/core/apiBaseUrl";
import { acquireRefreshLock, releaseRefreshLock } from "@/lib/auth/refreshLock";

const PRODUCT_KEY = process.env.NEXT_PUBLIC_PRODUCT_KEY?.trim() || "property";
const AUTH_DEBUG = false;

const logAuthDebug = (...args) => {
  if (!AUTH_DEBUG || typeof console === "undefined") return;
  console.debug(...args);
};

const FAILURE_COOLDOWN_MS = 5000;
const BOOTSTRAP_LOCK_KEY = "seaneb:auth:bootstrap:lock";
const BOOTSTRAP_TAB_KEY = "seaneb:auth:bootstrap:tab";
const BOOTSTRAP_LOCK_TTL_MS = 8000;
const BOOTSTRAP_LOCK_WAIT_MS = 2500;
const BOOTSTRAP_LOCK_POLL_MS = 100;
const REFRESH_ATTEMPT_COOLDOWN_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let inFlightEnsureSessionPromise = null;
let lastFailureAt = 0;

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

const canUseStorage = () => {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const canUseSessionStorage = () => {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.sessionStorage);
  } catch {
    return false;
  }
};

const getBootstrapTabId = () => {
  if (!canUseSessionStorage()) return "";
  try {
    const existing = window.sessionStorage.getItem(BOOTSTRAP_TAB_KEY);
    if (existing) return existing;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(BOOTSTRAP_TAB_KEY, id);
    return id;
  } catch {
    return "";
  }
};

const readStorageJson = (key) => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeStorageJson = (key, value) => {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};


const acquireBootstrapLock = () => {
  if (!canUseStorage()) {
    return { acquired: true, id: "memory" };
  }

  const now = Date.now();
  const existing = readStorageJson(BOOTSTRAP_LOCK_KEY);
  const tabId = getBootstrapTabId();

  if (existing && now < Number(existing.expiresAt || 0)) {
    if (tabId && existing.tabId === tabId) {
      // Same-tab hard refresh: reclaim stale lock immediately.
    } else {
    return { acquired: false, id: existing.id || "" };
    }
  }

  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    tabId,
    startedAt: now,
    expiresAt: now + BOOTSTRAP_LOCK_TTL_MS,
  };

  writeStorageJson(BOOTSTRAP_LOCK_KEY, entry);

  const verify = readStorageJson(BOOTSTRAP_LOCK_KEY);
  if (!verify || verify.id !== id) {
    return { acquired: false, id: verify?.id || "" };
  }

  return { acquired: true, id };
};

const releaseBootstrapLock = (id) => {
  if (!canUseStorage()) return;
  const current = readStorageJson(BOOTSTRAP_LOCK_KEY);
  if (!current || current.id !== id) return;
  try {
    window.localStorage.removeItem(BOOTSTRAP_LOCK_KEY);
  } catch {
    // ignore storage cleanup errors
  }
};

const waitForBootstrapLockRelease = async () => {
  if (!canUseStorage()) return true;

  const tabId = getBootstrapTabId();
  const start = Date.now();
  while (Date.now() - start < BOOTSTRAP_LOCK_WAIT_MS) {
    const current = readStorageJson(BOOTSTRAP_LOCK_KEY);
    if (!current || Date.now() >= Number(current.expiresAt || 0)) {
      return true;
    }
    if (tabId && current.tabId === tabId) {
      return true;
    }
    await sleep(BOOTSTRAP_LOCK_POLL_MS);
  }

  return false;
};

const hasCsrfTokenCookie = () => {
  if (typeof document === "undefined") return false;

  const cookies = document.cookie
    .split(";")
    .map((p) => String(p || "").trim());

  return CSRF_COOKIE_KEYS.some((key) =>
    cookies.some((cookie) => cookie.startsWith(`${key}=`))
  );
};

const readCsrfFromCookie = () => {
  if (typeof document === "undefined") return "";

  const cookies = String(document.cookie || "")
    .split(";")
    .map((p) => String(p || "").trim());

  for (const cookie of cookies) {
    const idx = cookie.indexOf("=");
    if (idx < 0) continue;

    const name = cookie.slice(0, idx).trim();
    if (CSRF_COOKIE_KEYS.includes(name)) {
      const val = cookie.slice(idx + 1).trim();
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }

  return "";
};

const buildApiPath = (path) => {
  const base = String(API_BASE_URL || "").trim().replace(/\/+$/, "");
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${safePath}` : safePath;
};

const readBearerTokenFromHeaders = (headers) => {
  const headerAuth = String(
    headers?.get?.("authorization") || headers?.get?.("Authorization") || ""
  ).trim();

  if (!headerAuth) return "";
  return /^Bearer\s+/i.test(headerAuth)
    ? headerAuth.replace(/^Bearer\s+/i, "").trim()
    : headerAuth;
};

const readCsrfTokenFromHeaders = (headers) =>
  String(
    headers?.get?.("x-csrf-token") ||
      headers?.get?.("x-xsrf-token") ||
      headers?.get?.("csrf-token") ||
      ""
  ).trim();

const hydrateSessionFromFetchResponse = (response) => {
  const accessToken = readBearerTokenFromHeaders(response?.headers);
  const csrfToken = readCsrfTokenFromHeaders(response?.headers);

  if (accessToken || csrfToken) {
    hydrateAuthSession({
      accessToken,
      csrfToken,
      broadcast: false,
    });
  }

  return { accessToken, csrfToken };
};

const buildAuthProbeHeaders = () => {
  const headers = new Headers();

  const accessToken = getAccessToken() || getInMemoryAccessToken();
  const csrfToken =
    getCsrfToken() || getInMemoryCsrfToken() || readCsrfFromCookie();
  const csrfHeaderValue = String(csrfToken || "").trim();

  if (accessToken?.trim()) {
    headers.set("authorization", `Bearer ${accessToken.trim()}`);
  }

  headers.set("x-csrf-token", csrfHeaderValue);
  headers.set("x-xsrf-token", csrfHeaderValue);
  headers.set("csrf-token", csrfHeaderValue);

  headers.set("x-product-key", PRODUCT_KEY);

  return headers;
};

const hasClientSession = () => {
  const token =
    getAccessToken() ||
    getInMemoryAccessToken() ||
    getCsrfToken() ||
    getInMemoryCsrfToken();

  return Boolean(String(token || "").trim() || hasCsrfTokenCookie());
};

const requestMe = async () => {
  const response = await fetch(buildApiPath("/auth/me"), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: buildAuthProbeHeaders(),
  });

  if (response.ok) {
    hydrateSessionFromFetchResponse(response);
  }

  return response;
};

const requestRefresh = async () => {
  const headers = buildAuthProbeHeaders();
  headers.set("content-type", "application/json");

  const lockReleased = await waitForSsoLockRelease();
  if (!lockReleased) {
    const lockError = new Error("SSO lock active");
    lockError.code = "SSO_LOCK_ACTIVE";
    throw lockError;
  }

  const refreshLock = await acquireRefreshLock({ source: "auth-bootstrap" });
  if (!refreshLock.acquired) {
    const lockError = new Error("Refresh lock unavailable");
    lockError.code = "REFRESH_LOCKED";
    throw lockError;
  }

  try {
    return fetch(buildApiPath("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
      headers,
      body: JSON.stringify({
        product_key: PRODUCT_KEY,
      }),
    });
  } finally {
    releaseRefreshLock(refreshLock.id);
  }
};

const requestSessionHint = async ({ force = false } = {}) => {
  const hint = await getSessionHint({ force });
  return {
    success: Boolean(hint?.success),
    hasRefreshSession: Boolean(hint?.hasRefreshSession),
    hasCsrfCookie: Boolean(hint?.hasCsrfCookie),
  };
};

const readRefreshPayload = async (response) => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const readResponsePayload = async (response) => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const isPanelAccessRestrictedPayload = (payload = null) => {
  const message = String(
    payload?.error?.message || payload?.message || ""
  ).trim();
  return /no active branch associated/i.test(message);
};

const getCurrentPathname = () => {
  if (typeof window === "undefined") return "";
  return String(window.location.pathname || "").trim();
};

const isBusinessPanelRoute = (pathname = getCurrentPathname()) => {
  const safePath = String(pathname || "").trim();
  return (
    safePath.startsWith("/dashboard/broker") ||
    safePath.startsWith("/auth/business-register")
  );
};

const shouldTreatForbiddenProfileAsAuthenticated = (payload = null) => {
  if (isPanelAccessRestrictedPayload(payload)) return true;
  if (!isBusinessPanelRoute()) return false;

  const code = String(payload?.error?.code || payload?.code || "").trim().toLowerCase();
  const message = String(payload?.error?.message || payload?.message || "").trim().toLowerCase();
  if (!code && !message) return true;

  return (
    code.includes("access_denied") ||
    code.includes("forbidden") ||
    message.includes("access denied") ||
    message.includes("forbidden") ||
    message.includes("branch") ||
    message.includes("business")
  );
};

const isPanelAccessRestrictedResponse = async (response) => {
  if (Number(response?.status || 0) !== 403) return false;
  const payload = await readResponsePayload(response);
  return shouldTreatForbiddenProfileAsAuthenticated(payload);
};

export const ensureSessionReady = async ({ force = false } = {}) => {
  const now = Date.now();

  if (!force && lastFailureAt && now - lastFailureAt < FAILURE_COOLDOWN_MS) {
    return false;
  }

  if (inFlightEnsureSessionPromise) {
    return inFlightEnsureSessionPromise;
  }

  inFlightEnsureSessionPromise = (async () => {
    const bootstrapLock = acquireBootstrapLock();

    try {
      if (!bootstrapLock.acquired) {
        await waitForBootstrapLockRelease();

        const postLockMe = await requestMe();
        if (postLockMe.ok) {
          return true;
        }
        if (await isPanelAccessRestrictedResponse(postLockMe)) {
          return true;
        }
      }

      // Fast-path: if there are no client-side hints of a session (in-memory
      // access token or a client-readable CSRF cookie) skip the server probe
      // and return quickly - but only when this is not a forced probe. When
      // `force` is true, always ask the server for the session hint so callers
      // (e.g., post-registration flows) can rehydrate the session.
      const hasAccessToken = Boolean(
        String(getInMemoryAccessToken() || "").trim()
      );

      let sessionHint = null;
      if (!force && !hasAccessToken) {
        sessionHint = await requestSessionHint({ force });
        if (!sessionHint?.hasRefreshSession) {
          lastFailureAt = Date.now();
          return false;
        }
      }

      // If client hints exist, ask the server whether a refresh session exists.
      if (!sessionHint) {
        sessionHint = await requestSessionHint({ force });
      }
      const hasRefreshSession = Boolean(sessionHint?.hasRefreshSession);
      const hasSessionCsrfCookie = Boolean(sessionHint?.hasCsrfCookie);
      logAuthDebug("[auth.bootstrap] session hint", { hasRefreshSession, hasSessionCsrfCookie });

      if (
        sessionHint?.success &&
        !hasRefreshSession &&
        !hasAccessToken
      ) {
        lastFailureAt = Date.now();
        return false;
      }

      const hydrateTokenFromRefresh = async () => {
        let budget = tryUseRefreshBudget({
          source: "bootstrap",
          cooldownMs: REFRESH_ATTEMPT_COOLDOWN_MS,
        });
        if (!budget.allowed) {
          if (budget.limited) {
            clearRefreshBudget();
            budget = tryUseRefreshBudget({
              source: "bootstrap",
              cooldownMs: REFRESH_ATTEMPT_COOLDOWN_MS,
            });
          }
        }

        if (!budget.allowed) {
          return {
            ok: false,
            refreshStatus: 0,
            canRetry: !budget.limited,
            deferred: budget.deferred,
            limited: budget.limited,
          };
        }

        try {
          const refreshResponse = await requestRefresh();

          if (!refreshResponse.ok) {
            const status = Number(refreshResponse.status || 0);
            if ([401, 403].includes(status)) {
              return {
                ok: false,
                refreshStatus: status,
                canRetry: false,
                invalidSession: true,
              };
            }
            const canRetry = [429, 500, 502, 503, 504].includes(status);

            return {
              ok: false,
              refreshStatus: status,
              canRetry,
            };
          }

          const payload = await readRefreshPayload(refreshResponse);

          const accessToken = String(
            payload?.accessToken || payload?.access_token || ""
          ).trim();

          const csrfToken = String(
            payload?.csrfToken || payload?.csrf_token || ""
          ).trim();

          if (accessToken || csrfToken) {
            hydrateAuthSession({
              accessToken,
              csrfToken,
              broadcast: true,
            });
          }
          clearRefreshBudget();

          return {
            ok: true,
            refreshStatus: refreshResponse.status,
            canRetry: false,
          };
        } catch {
          return {
            ok: false,
            refreshStatus: 0,
            canRetry: true,
          };
        }
      };

      let firstMe = null;

      const shouldRefreshFirst =
        hasRefreshSession && !hasAccessToken;

      if (shouldRefreshFirst) {
        const refresh = await hydrateTokenFromRefresh();
        if (refresh.ok) {
          if (hasClientSession()) return true;
          firstMe = await requestMe();
          if (firstMe.ok) {
            return true;
          }
        }
        if (refresh.invalidSession || [401, 403].includes(Number(refresh.refreshStatus || 0))) {
          clearAccessToken();
          lastFailureAt = Date.now();
          return false;
        }
      }

      if (!firstMe) {
        firstMe = await requestMe();
      }

      if (firstMe.ok) {
        if (hasClientSession()) return true;

        const refresh = await hydrateTokenFromRefresh();

        if (refresh.ok) {
          if (hasClientSession()) return true;
          const confirmMe = await requestMe();
          return confirmMe.ok;
        }

        const status = Number(refresh.refreshStatus || 0);
        if ([401, 403].includes(status)) {
          clearAccessToken();
          lastFailureAt = Date.now();
          return false;
        }

        return true;
      }

      if (await isPanelAccessRestrictedResponse(firstMe)) {
        return true;
      }

      const firstStatus = Number(firstMe.status || 0);

      if (![401, 403, 429, 500, 502, 503, 504].includes(firstStatus)) {
        console.warn("[auth.bootstrap] /api/auth/me failed", {
          status: firstStatus,
        });

        lastFailureAt = Date.now();

        return false;
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        const refresh = await hydrateTokenFromRefresh();

        if (!refresh.ok) {
          if (refresh.invalidSession) {
            clearAccessToken();
            lastFailureAt = Date.now();
            return false;
          }

          if (refresh.limited) {
            lastFailureAt = Date.now();
            return false;
          }

          const status = Number(refresh.refreshStatus || 0);

          if (refresh.canRetry && attempt < 2) {
            await sleep(200 * 2 ** attempt);
            continue;
          }

          if ([401, 403].includes(status)) {
            clearAccessToken();
            lastFailureAt = Date.now();
            return false;
          }

          console.warn("[auth.bootstrap] /api/auth/refresh failed", {
            status,
            attempt: attempt + 1,
          });

          if (hasRefreshSession) {
            logAuthDebug("[auth.bootstrap] refresh failed; using server session", {
              status,
            });
            return true;
          }

          lastFailureAt = Date.now();

          return false;
        }

        const retryMe = await requestMe();

        if (retryMe.ok) {
          return true;
        }

        if (await isPanelAccessRestrictedResponse(retryMe)) {
          return true;
        }

        const retryStatus = Number(retryMe.status || 0);

        const shouldRetry =
          [401, 403, 429, 500, 502, 503, 504].includes(retryStatus) && attempt < 2;

        if (shouldRetry) {
          await sleep(200 * 2 ** attempt);
          continue;
        }

        console.warn("[auth.bootstrap] /api/auth/me retry failed", {
          status: retryStatus,
          attempt: attempt + 1,
        });

        lastFailureAt = Date.now();

        return false;
      }

      if (hasRefreshSession) {
        logAuthDebug("[auth.bootstrap] refresh loop exhausted; using server session");
        return true;
      }

      lastFailureAt = Date.now();

      return false;
    } catch (error) {
      console.warn("[auth.bootstrap] ensureSessionReady error", {
        message: error?.message || "unknown_error",
      });

      lastFailureAt = Date.now();

      return false;
    } finally {
      if (bootstrapLock?.acquired) {
        releaseBootstrapLock(bootstrapLock.id);
      }
    }
  })();

  try {
    return await inFlightEnsureSessionPromise;
  } finally {
    inFlightEnsureSessionPromise = null;
  }
};

export const bootstrapProductAuth = async (options = {}) => {
  return ensureSessionReady(options);
};
