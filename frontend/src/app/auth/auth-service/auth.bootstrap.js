import {
  getInMemoryAccessToken,
  setInMemoryAccessToken,
  setInMemoryCsrfToken,
} from "@/lib/api/client";

const PRODUCT_KEY =
  String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";
const FAILURE_COOLDOWN_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let inFlightEnsureSessionPromise = null;
let lastFailureAt = 0;

const hasCsrfTokenCookie = () => {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .map((part) => String(part || "").trim())
    .some((part) => part.startsWith("csrf_token_property="));
};

const requestMe = async () => {
  return fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
};

const requestRefresh = async () => {
  return fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      product_key: PRODUCT_KEY,
    }),
  });
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
    const hydrateTokenFromRefresh = async () => {
      const refreshResponse = await requestRefresh();
      if (!refreshResponse.ok) {
        const refreshStatus = Number(refreshResponse.status || 0);
        const canRetry = [500, 502, 503, 504, 429].includes(refreshStatus);
        return { ok: false, refreshStatus, canRetry };
      }

      const refreshPayload = await readRefreshPayload(refreshResponse);
      const refreshedAccessToken = String(
        refreshPayload?.accessToken || refreshPayload?.access_token || ""
      ).trim();
      const refreshedCsrfToken = String(
        refreshPayload?.csrfToken || refreshPayload?.csrf_token || ""
      ).trim();
      if (refreshedAccessToken) {
        setInMemoryAccessToken(refreshedAccessToken);
      }
      if (refreshedCsrfToken) {
        setInMemoryCsrfToken(refreshedCsrfToken);
      }

      return { ok: true, refreshStatus: Number(refreshResponse.status || 200), canRetry: false };
    };

    // Try direct profile probe first (handles still-valid access cookie quickly).
    const firstMe = await requestMe();
    if (firstMe.ok) {
      if (getInMemoryAccessToken()) return true;

      const refreshResult = await hydrateTokenFromRefresh();
      if (refreshResult.ok) {
        return Boolean(getInMemoryAccessToken());
      }
    }

    const firstStatus = Number(firstMe.status || 0);
    if ([401, 403].includes(firstStatus)) {
      // Do not gate refresh attempts on JS-readable CSRF cookie presence.
      // Some deployments issue CSRF as HttpOnly or mint it only on refresh.
      // Our refresh route can retry without CSRF and will set a readable cookie on success.
    }

    if (![401, 403, 500, 502, 503, 504].includes(firstStatus)) {
      console.warn("[auth.bootstrap] /api/auth/me failed", { status: firstStatus });
      lastFailureAt = Date.now();
      return false;
    }

    // Retry refresh flow a few times to tolerate transient upstream failures.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const refreshResult = await hydrateTokenFromRefresh();
      if (!refreshResult.ok) {
        const refreshStatus = Number(refreshResult.refreshStatus || 0);
        const canRetry = Boolean(refreshResult.canRetry);
        if (canRetry && attempt < 2) {
          await sleep(200 * (attempt + 1));
          continue;
        }
        if ([401, 403].includes(refreshStatus)) {
          // Expected when refresh cookie/session is missing or expired.
          lastFailureAt = Date.now();
          return false;
        }
        console.warn("[auth.bootstrap] /api/auth/refresh failed", {
          status: refreshStatus,
          attempt: attempt + 1,
        });
        lastFailureAt = Date.now();
        return false;
      }

      const retryMeResponse = await requestMe();
      if (retryMeResponse.ok && getInMemoryAccessToken()) return true;

      const retryStatus = Number(retryMeResponse.status || 0);
      const shouldRetry = [401, 403, 500, 502, 503, 504].includes(retryStatus) && attempt < 2;
      if (shouldRetry) {
        await sleep(200 * (attempt + 1));
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
