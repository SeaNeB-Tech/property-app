export { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
export {
  authApi,
  apiJson,
  apiRequest,
  refreshSession,
  setAuthFailureHandler,
} from "@/lib/auth/apiClient";
export {
  getCookie,
  removeCookie,
  setCookie,
} from "@/lib/auth/cookieManager";
export {
  clearAccessToken,
  clearRefreshToken,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/auth/tokenStorage";
export { getCurrentUser, isAuthenticated } from "@/lib/auth/authStateBridge";

if (typeof globalThis !== "undefined" && !globalThis.__SEANEB_AUTH_SAFE_MODE_COMPAT_FA__) {
  globalThis.__SEANEB_AUTH_SAFE_MODE_COMPAT_FA__ = true;
  console.info("[AUTH SAFE MODE] using shared auth layer");
}

