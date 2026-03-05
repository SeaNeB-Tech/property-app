const DEBUG_FLAG = String(process.env.NEXT_PUBLIC_DEBUG_SSO || "")
  .trim()
  .toLowerCase();

const DEBUG_ENABLED = ["1", "true", "yes", "on"].includes(DEBUG_FLAG);

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

