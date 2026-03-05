import { authStore } from "@/app/auth/auth-service/store/authStore";

const logSafeMode = () => {
  if (typeof globalThis === "undefined") return;
  if (globalThis.__SEANEB_AUTH_SAFE_MODE_STATE_BRIDGE_FA__) return;
  globalThis.__SEANEB_AUTH_SAFE_MODE_STATE_BRIDGE_FA__ = true;
  console.info("[AUTH SAFE MODE] using shared auth layer");
};

export const getCurrentUser = () => {
  logSafeMode();
  if (typeof window === "undefined") return null;
  const cached = window.__SEANEB_AUTH_USER__;
  return cached && typeof cached === "object" ? cached : null;
};

export const isAuthenticated = () => {
  logSafeMode();
  const token = String(authStore?.getAccessToken?.() || "").trim();
  const csrf = String(authStore?.getCsrfToken?.() || "").trim();
  return Boolean(token || csrf);
};

