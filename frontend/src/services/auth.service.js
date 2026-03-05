import { removeCookie } from "@/lib/core/cookies";
import {
  authApi,
  clearInMemoryAccessToken,
  setInMemoryCsrfToken,
} from "@/lib/api/client";
import { authStore } from "@/app/auth/auth-service/store/authStore";

const AUTH_CHANGE_EVENT = "seaneb:auth-changed";

export {
  clearGuestCsrfCookies,
  clearPreAuthCsrfCookies,
  getCookie,
  getJsonCookie,
  removeCookie,
  setCookie,
  setJsonCookie,
} from "@/lib/core/cookies";

export const isAuthenticatedByCookies = () => {
  return false;
};

const forceExpireCookie = (name, domain = "") => {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const base = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${base}${secure}`;
  if (domain) {
    document.cookie = `${base}; domain=${domain}${secure}`;
  }
};

const forceDeleteAuthCookies = () => {
  if (typeof window === "undefined") return;
  const configuredDomain = String(process.env.NEXT_PUBLIC_COOKIE_DOMAIN || "").trim();
  const host = String(window.location.hostname || "").toLowerCase();
  const maybeParentDomain = host.includes(".") ? `.${host.split(".").slice(-2).join(".")}` : "";
  const domains = Array.from(new Set(["", configuredDomain, maybeParentDomain].filter(Boolean)));
  const cookieNames = ["access_token", "refresh_token_property", "csrf_token_property"];
  for (const name of cookieNames) {
    for (const domain of domains) {
      forceExpireCookie(name, domain);
    }
  }
};

export const clearPanelAuthSession = () => {
  clearInMemoryAccessToken();
  setInMemoryCsrfToken("");
  authStore.clearAll();
  removeCookie("csrf_token_property");
  notifyAuthChanged();
};

export const logoutPanelSession = async () => {
  let canClearClientState = false;
  try {
    await authApi.post("/auth/logout", {}, { skipAuthRedirect: true });
    canClearClientState = true;
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 401 || status === 403) {
      canClearClientState = true;
    } else {
      throw error;
    }
  } finally {
    if (canClearClientState) {
      forceDeleteAuthCookies();
      clearPanelAuthSession();
    }
  }
  return canClearClientState;
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
