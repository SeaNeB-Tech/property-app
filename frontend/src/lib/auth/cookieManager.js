import cookieService, {
  getCookie as legacyGetCookie,
  removeCookie as legacyRemoveCookie,
  setCookie as legacySetCookie,
} from "@/lib/core/cookies";

const logSafeMode = () => {
  if (typeof globalThis === "undefined") return;
  if (globalThis.__SEANEB_AUTH_SAFE_MODE_COOKIE_MANAGER_FA__) return;
  globalThis.__SEANEB_AUTH_SAFE_MODE_COOKIE_MANAGER_FA__ = true;
  console.info("[AUTH SAFE MODE] using shared auth layer");
};

const fallbackGetCookie = (name) => {
  if (typeof document === "undefined") return null;
  const target = String(name || "").trim();
  if (!target) return null;
  const pairs = String(document.cookie || "").split("; ");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = decodeURIComponent(pair.slice(0, idx));
    if (key !== target) continue;
    return decodeURIComponent(pair.slice(idx + 1));
  }
  return null;
};

export const getCookie = (name) => {
  logSafeMode();
  if (typeof legacyGetCookie === "function") return legacyGetCookie(name);
  if (cookieService && typeof cookieService.getCookie === "function") {
    return cookieService.getCookie(name);
  }
  return fallbackGetCookie(name);
};

export const setCookie = (name, value, options = {}) => {
  logSafeMode();
  if (typeof legacySetCookie === "function") return legacySetCookie(name, value, options);
  if (cookieService && typeof cookieService.setCookie === "function") {
    return cookieService.setCookie(name, value, options);
  }
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
};

export const removeCookie = (name, options = {}) => {
  logSafeMode();
  if (typeof legacyRemoveCookie === "function") return legacyRemoveCookie(name, options);
  if (cookieService && typeof cookieService.removeCookie === "function") {
    return cookieService.removeCookie(name, options);
  }
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(name)}=; max-age=0`;
};


