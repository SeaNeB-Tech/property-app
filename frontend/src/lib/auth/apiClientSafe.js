const logSafeMode = () => {
  if (typeof globalThis === "undefined") return;
  if (globalThis.__SEANEB_AUTH_SAFE_MODE_API_SAFE_FA__) return;
  globalThis.__SEANEB_AUTH_SAFE_MODE_API_SAFE_FA__ = true;
  console.info("[AUTH SAFE MODE] using shared auth layer");
};

export const attachAuthorizationHeader = (headers) => {
  // Strict cookie-based auth: never attach bearer tokens from JS.
  return new Headers(headers || {});
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
