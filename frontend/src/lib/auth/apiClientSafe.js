import { getAccessToken } from "@/lib/auth/tokenStorage";

const logSafeMode = () => {
  if (typeof globalThis === "undefined") return;
  if (globalThis.__SEANEB_AUTH_SAFE_MODE_API_SAFE_FA__) return;
  globalThis.__SEANEB_AUTH_SAFE_MODE_API_SAFE_FA__ = true;
  console.info("[AUTH SAFE MODE] using shared auth layer");
};

const isUsableAccessToken = (value) => {
  const token = String(value || "").trim();
  if (!token) return false;
  const lowered = token.toLowerCase();
  return !["cookie_session", "null", "undefined", "invalid", "sentinel"].includes(lowered);
};

export const attachAuthorizationHeader = (headers) => {
  const next = new Headers(headers || {});
  const accessToken = String(getAccessToken() || "").trim();
  if (isUsableAccessToken(accessToken)) {
    next.set("Authorization", `Bearer ${accessToken}`);
  }
  return next;
};

export const requestWithAuthSafeRetry = async ({
  makeRequest,
  retryOn401 = true,
  isRefreshRequest = false,
  refresh,
  markRetried,
}) => {
  logSafeMode();
  const firstResponse = await makeRequest();
  if (!retryOn401 || isRefreshRequest || firstResponse?.status !== 401) {
    return firstResponse;
  }

  if (typeof markRetried === "function") {
    markRetried();
  }

  try {
    if (typeof refresh === "function") {
      await refresh();
    }
  } catch {
    return firstResponse;
  }

  return makeRequest();
};
