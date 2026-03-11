import {
  getInMemoryAccessToken,
  getInMemoryCsrfToken,
  hydrateAuthSession,
} from "@/lib/api/client";

import { clearAccessToken, getAccessToken, getCsrfToken } from "@/lib/auth/tokenStorage";

const PRODUCT_KEY = process.env.NEXT_PUBLIC_PRODUCT_KEY?.trim() || "property";

const FAILURE_COOLDOWN_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let inFlightEnsureSessionPromise = null;
let lastFailureAt = 0;

const hasCsrfTokenCookie = () => {
  if (typeof document === "undefined") return false;

  return document.cookie
    .split(";")
    .map((p) => String(p || "").trim())
    .some((p) => p.startsWith("csrf_token_property="));
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

    if (name === "csrf_token_property") {
      return cookie.slice(idx + 1).trim();
    }
  }

  return "";
};

const buildAuthProbeHeaders = () => {
  const headers = new Headers();

  const accessToken = getAccessToken() || getInMemoryAccessToken();
  const csrfToken =
    getCsrfToken() || getInMemoryCsrfToken() || readCsrfFromCookie();

  if (accessToken?.trim()) {
    headers.set("authorization", `Bearer ${accessToken.trim()}`);
  }

  if (csrfToken?.trim()) {
    headers.set("x-csrf-token", csrfToken.trim());
  }

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
  return fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: buildAuthProbeHeaders(),
  });
};

const requestRefresh = async () => {
  const headers = buildAuthProbeHeaders();
  headers.set("content-type", "application/json");

  return fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      product_key: PRODUCT_KEY,
    }),
  });
};

const requestSessionHint = async () => {
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!res.ok) return { hasRefreshSession: false };

    const payload = await res.json().catch(() => ({}));

    return {
      hasRefreshSession: Boolean(payload?.hasRefreshSession),
    };
  } catch {
    return { hasRefreshSession: false };
  }
};

const readRefreshPayload = async (response) => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
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
    try {

      // Fast-path: if there are no client-side hints of a session (in-memory
      // access token or a client-readable CSRF cookie) skip the server probe
      // and return quickly - but only when this is not a forced probe. When
      // `force` is true, always ask the server for the session hint so callers
      // (e.g., post-registration flows) can rehydrate the session.
      const hasAccessToken = Boolean(
        String(getInMemoryAccessToken() || "").trim()
      );

      const hasCsrfCookie = hasCsrfTokenCookie();

      let sessionHint = null;
      if (!force && !hasAccessToken && !hasCsrfCookie) {
        sessionHint = await requestSessionHint();
        if (!sessionHint?.hasRefreshSession) {
          lastFailureAt = Date.now();
          return false;
        }
      }

      // If client hints exist, ask the server whether a refresh session exists.
      if (!sessionHint) {
        sessionHint = await requestSessionHint();
      }
      const hasRefreshSession = Boolean(sessionHint?.hasRefreshSession);

      const hydrateTokenFromRefresh = async () => {
        try {
          const refreshResponse = await requestRefresh();

          if (!refreshResponse.ok) {
            const status = Number(refreshResponse.status || 0);

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

      const firstMe = await requestMe();

      if (firstMe.ok) {
        if (hasClientSession()) return true;

        const refresh = await hydrateTokenFromRefresh();

        if (refresh.ok) {
          return hasClientSession();
        }

        return true;
      }

      const firstStatus = Number(firstMe.status || 0);

      if (![401, 403, 500, 502, 503, 504].includes(firstStatus)) {
        console.warn("[auth.bootstrap] /api/auth/me failed", {
          status: firstStatus,
        });

        lastFailureAt = Date.now();

        return false;
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        const refresh = await hydrateTokenFromRefresh();

        if (!refresh.ok) {
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

          lastFailureAt = Date.now();

          return false;
        }

        const retryMe = await requestMe();

        if (retryMe.ok) {
          return true;
        }

        const retryStatus = Number(retryMe.status || 0);

        const shouldRetry =
          [401, 403, 500, 502, 503, 504].includes(retryStatus) && attempt < 2;

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

      lastFailureAt = Date.now();

      return false;
    } catch (error) {
      console.warn("[auth.bootstrap] ensureSessionReady error", {
        message: error?.message || "unknown_error",
      });

      lastFailureAt = Date.now();

      return false;
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
