// Simple cookie helper for storing JSON and string values
const isBrowser = typeof window !== "undefined";
const isProduction = String(process.env.NODE_ENV || "").trim() === "production";

const envCookiePath = process.env.NEXT_PUBLIC_COOKIE_PATH || "/";
const envCookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || (isProduction ? ".seaneb.com" : "");
const envSameSite = process.env.NEXT_PUBLIC_COOKIE_SAMESITE || "None";
const COOKIE_CHANGE_EVENT = "property:cookie-change";
const STORAGE_PREFIX = "property:volatile:";
const volatileMemoryStore = new Map();
const REAL_COOKIE_KEYS = new Set([
  "refresh_token_property",
  "csrf_token_property",
  // Server-visible marker to allow profile completion right after OTP verification.
  "post_otp_verified",
]);
if (isBrowser) {
  try {
    const removeIfExists = (storage, key) => {
      try {
        storage.removeItem(key);
      } catch {
        // ignore storage errors
      }
    };

    const authKeys = [
      "access_token",
      "refresh_token_property",
      "csrf_token_property",
      "auth_session",
    ];

    for (const key of authKeys) {
      removeIfExists(window.sessionStorage, key);
      removeIfExists(window.localStorage, key);
      removeIfExists(window.sessionStorage, `${STORAGE_PREFIX}${key}`);
      removeIfExists(window.localStorage, `${STORAGE_PREFIX}${key}`);
    }

    const keys = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (String(key || "").startsWith(STORAGE_PREFIX)) {
        keys.push(String(key));
      }
    }
    for (const key of keys) {
      const suffix = key.slice(STORAGE_PREFIX.length).toLowerCase();
      if (
        suffix === "access_token" ||
        suffix === "refresh_token_property" ||
        suffix === "csrf_token_property" ||
        suffix === "auth_session" ||
        suffix.startsWith("access_token_") ||
        suffix.startsWith("refresh_token_property") ||
        suffix.startsWith("csrf_token_property")
      ) {
        removeIfExists(window.sessionStorage, key);
      }
    }
  } catch {
    // ignore storage read/write errors
  }
}
const isAuthCookieName = (name) => {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return false;
  return (
    key === "csrf_token_property" ||
    key === "refresh_token_property" ||
    key === "access_token" ||
    key === "auth_session" ||
    key.startsWith("csrf_token_property") ||
    key.startsWith("refresh_token_property") ||
    key.startsWith("access_token_") ||
    key.startsWith("auth_session_")
  );
};

const isEssentialCookieName = (name) => {
  const key = String(name || "").trim().toLowerCase();
  return REAL_COOKIE_KEYS.has(key);
};

const isBlockedAuthCookieWrite = (name) => {
  return isAuthCookieName(name);
};

const normalizePath = (path) => {
  if (!path || typeof path !== "string") return "/";
  return path.startsWith("/") ? path : `/${path}`;
};

const resolveDomain = (domain) => {
  const safeDomain = String(domain || "").trim().replace(/:\d+$/, "");
  if (!safeDomain || !isBrowser) return safeDomain;

  const host = String(window.location.hostname || "").toLowerCase();
  const isIpv4Loopback = /^127(?:\.\d{1,3}){3}$/.test(host);
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
  const isIpv6 = host.includes(":");
  const isLoopbackHost =
    isIpv4Loopback ||
    host === "::1" ||
    host.endsWith(".local");

  // Domain cookies on loopback hosts often break auth sharing in multi-port setup.
  if (isLoopbackHost) return "";
  // Domain cookies are rejected on raw IP hosts. Keep host-only cookies.
  if (isIpv4 || isIpv6) return "";
  return safeDomain;
};

const resolveCookieOptions = (options = {}) => {
  const path = normalizePath(options.path || envCookiePath);
  const domain = resolveDomain(options.domain ?? envCookieDomain);
  const normalizeSameSite = (value, isSecure) => {
    const raw = String(value ?? "").trim();
    const normalized = raw.toLowerCase();
    if (!normalized) return "";
    if (normalized === "lax") return "Lax";
    if (normalized === "none") return isSecure ? "None" : "Lax";
    if (normalized === "strict") return "Strict";
    return raw;
  };
  const secure =
    typeof options.secure === "boolean"
      ? options.secure
      : (isBrowser ? window.location.protocol === "https:" : false);
  const sameSite = normalizeSameSite(options.sameSite ?? envSameSite, secure);

  return { ...options, path, domain, sameSite, secure };
};

const emitCookieChange = (name) => {
  if (!isBrowser) return;
  try {
    window.dispatchEvent(new CustomEvent(COOKIE_CHANGE_EVENT, { detail: { name } }));
  } catch {
    // Ignore event dispatch issues in older environments.
  }
};

const usesRealCookie = (name) => isEssentialCookieName(name);

const getStorageKey = (name) => `${STORAGE_PREFIX}${String(name || "").trim()}`;

const readStoredRecord = (name) => {
  const key = getStorageKey(name);
  const memoryValue = volatileMemoryStore.get(key);
  if (memoryValue != null) {
    return { value: String(memoryValue ?? ""), expiresAt: null };
  }
  if (!isBrowser) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const expiresAt = Number(parsed.expiresAt || 0);
    if (expiresAt > 0 && Date.now() > expiresAt) {
      window.localStorage.removeItem(key);
      return null;
    }
    return {
      value: String(parsed.value ?? ""),
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
    };
  } catch {
    return null;
  }
};

const setVolatileValue = (name, value, options = {}) => {
  const key = getStorageKey(name);
  const safeValue = String(value ?? "");
  volatileMemoryStore.set(key, safeValue);
  if (!isBrowser) return;
  try {
    const maxAge = Number(options?.maxAge);
    const expiresAt = Number.isFinite(maxAge) && maxAge > 0 ? Date.now() + maxAge * 1000 : null;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        value: safeValue,
        expiresAt,
      })
    );
  } catch {
    // ignore storage failures
  }
};

const getVolatileValue = (name) => {
  const stored = readStoredRecord(name);
  return stored ? stored.value : null;
};

const removeVolatileValue = (name) => {
  const key = getStorageKey(name);
  volatileMemoryStore.delete(key);
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
};

const clearRealCookieOnly = (name, options = {}) => {
  if (!isBrowser) return;
  const { path, domain, sameSite, secure } = resolveCookieOptions(options);
  let cookie = `${encodeURIComponent(name)}=; path=${path}; max-age=0`;
  if (domain) cookie += `; domain=${domain}`;
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  if (secure) cookie += "; Secure";
  document.cookie = cookie;
};

if (isBrowser) {
  clearRealCookieOnly("access_token");
}

export const setCookie = (name, value, options = {}) => {
  if (!isBrowser) return;
  if (isBlockedAuthCookieWrite(name)) {
    // Auth cookies are backend-managed. Frontend must not write or cache them.
    emitCookieChange(name);
    return;
  }

  if (!usesRealCookie(name)) {
    setVolatileValue(name, value, options);
    clearRealCookieOnly(name, options);
    emitCookieChange(name);
    return;
  }

  removeVolatileValue(name);
  const { maxAge, path, domain, sameSite, secure } = resolveCookieOptions(options);

  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path}`;
  if (typeof maxAge === "number") cookie += `; max-age=${maxAge}`;
  if (domain) cookie += `; domain=${domain}`;
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  if (secure) cookie += "; Secure";

  document.cookie = cookie;
  emitCookieChange(name);
};

export const getCookie = (name) => {
  if (!isBrowser) return null;

  if (!usesRealCookie(name)) {
    const fromStorage = getVolatileValue(name);
    if (fromStorage != null) return fromStorage;
  }

  const pairs = document.cookie.split("; ");
  for (const p of pairs) {
    if (!p) continue;
    // FIX: Split only on the FIRST "=" to handle values that contain "="
    const eqIndex = p.indexOf("=");
    if (eqIndex < 0) continue;
    const k = p.substring(0, eqIndex);
    const v = p.substring(eqIndex + 1);
    if (decodeURIComponent(k) === name) {
      const decoded = decodeURIComponent(v || "");
      if (!usesRealCookie(name)) {
        setVolatileValue(name, decoded);
        clearRealCookieOnly(name);
      }
      return decoded;
    }
  }
  return null;
};

export const removeCookie = (name, options = {}) => {
  if (!isBrowser) return;
  const key = String(name || "").trim().toLowerCase();
  if (isAuthCookieName(name) && key !== "csrf_token_property" && key !== "access_token") return;
  removeVolatileValue(name);
  const { path, domain, sameSite, secure } = resolveCookieOptions(options);
  let cookie = `${encodeURIComponent(name)}=; path=${path}; max-age=0`;
  if (domain) cookie += `; domain=${domain}`;
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  if (secure) cookie += "; Secure";
  document.cookie = cookie;
  emitCookieChange(name);
};

export const clearGuestCsrfCookies = () => {
  if (!isBrowser) return;
  // Do not clear server-issued csrf_token_property from the frontend.
};

export const clearPreAuthCsrfCookies = () => {
  if (!isBrowser) return;
  // Strict mode: no fallback CSRF cookie keys are managed.
};

export const setJsonCookie = (name, obj, options = {}) => {
  try {
    setCookie(name, JSON.stringify(obj), options);
  } catch (e) {
    // ignore
  }
};

export const getJsonCookie = (name) => {
  try {
    const v = getCookie(name);
    if (!v) return null;
    return JSON.parse(v);
  } catch (e) {
    return null;
  }
};

const cookieService = { setCookie, getCookie, removeCookie, setJsonCookie, getJsonCookie };

export default cookieService;
