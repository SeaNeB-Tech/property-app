const DEBUG_ENABLED = false;

export const ssoDebugLog = (event, meta = {}) => {
  if (!DEBUG_ENABLED) return;
  const payload = {
    scope: "sso",
    event: String(event || "").trim() || "unknown",
    at: Date.now(),
    ...(meta && typeof meta === "object" ? meta : {}),
  };
  try {
    console.info("[SSO_DEBUG]", payload);
  } catch {
    // ignore logging failures
  }
};

