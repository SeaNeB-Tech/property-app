import { removeCookie } from "./cookie";
import api, { clearInMemoryAccessToken, setInMemoryCsrfToken } from "@/lib/api/client";
import { authStore } from "@/app/auth/auth-service/store/authStore";

const AUTH_CHANGE_EVENT = "seaneb:auth-changed";

export const isAuthenticatedByCookies = () => {
  // Never infer authenticated state from readable cookies.
  // Session must be validated by backend endpoints.
  return false;
};

export const clearPanelAuthSession = () => {
  clearInMemoryAccessToken();
  setInMemoryCsrfToken("");
  authStore.clearAll();
  removeCookie("csrf_token_property");
  notifyAuthChanged();
};

export const logoutPanelSession = async () => {
  try {
    await api.post("/auth/logout", {}, { withCredentials: true, skipAuthRedirect: true });
  } catch {
    // Always clear local auth state even when server logout fails.
  } finally {
    clearPanelAuthSession();
  }
};

export const notifyAuthChanged = () => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  } catch {
    // Ignore event dispatch issues.
  }
};

export const subscribeAuthState = (callback) => {
  if (typeof window === "undefined") return () => {};

  const listener = () => callback();
  window.addEventListener("focus", listener);
  window.addEventListener("property:cookie-change", listener);
  window.addEventListener(AUTH_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("focus", listener);
    window.removeEventListener("property:cookie-change", listener);
    window.removeEventListener(AUTH_CHANGE_EVENT, listener);
  };
};
