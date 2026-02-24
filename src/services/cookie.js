// Simple cookie helper for storing JSON and string values
const isBrowser = typeof window !== "undefined";

const envCookiePath = process.env.NEXT_PUBLIC_COOKIE_PATH || "/";
const envCookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || "";
const envSameSite = process.env.NEXT_PUBLIC_COOKIE_SAMESITE || "Lax";
const COOKIE_CHANGE_EVENT = "property:cookie-change";
const STORAGE_PREFIX = "property:volatile:";
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
      "refresh_token",
      "refresh_token_property",
      "csrf_token",
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
        suffix === "refresh_token" ||
        suffix === "refresh_token_property" ||
        suffix === "csrf_token" ||
        suffix === "csrf_token_property" ||
        suffix === "auth_session" ||
        suffix.startsWith("access_token_") ||
        suffix.startsWith("refresh_token_") ||
        suffix.startsWith("csrf_token_")
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
    key === "csrf_token" ||
    key === "refresh_token" ||
    key === "access_token" ||
    key === "auth_session" ||
    key === "refesh_token" ||
    key.startsWith("csrf_token_") ||
    key.startsWith("refresh_token_") ||
    key.startsWith("access_token_") ||
    key.startsWith("auth_session_") ||
    key.startsWith("refesh_token_")
  );
};
const isEssentialCookieName = (name) => {
  const key = String(name || "").trim().toLowerCase();
  return (
    key === "refresh_token" ||
    key === "refresh_token_property" ||
    key === "refesh_token" ||
    key === "csrf_token" ||
    key === "csrf_token_property" ||
    key === "post_otp_verified" ||
    key === "otp_context" ||
    key === "otp_in_progress" ||
    false
  );
};

const isBlockedAuthCookieWrite = (name) => {
  return isAuthCookieName(name);
};

const normalizePath = (path) => {
  if (!path || typeof path !== "string") return "/";
  return path.startsWith("/") ? path : `/${path}`;
};

const resolveDomain = (domain) => {
  const safeDomain = String(domain || "").trim();
  if (!safeDomain || !isBrowser) return safeDomain;

  const host = String(window.location.hostname || "").toLowerCase();
  const isLoopbackHost =
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");

  // Domain cookies on loopback hosts often break auth sharing in multi-port setup.
  if (isLoopbackHost) return "";
  return safeDomain;
};

const resolveCookieOptions = (options = {}) => {
  const path = normalizePath(options.path || envCookiePath);
  const domain = resolveDomain(options.domain ?? envCookieDomain);
  const sameSite = options.sameSite ?? envSameSite;
  const secure =
    typeof options.secure === "boolean"
      ? options.secure
      : (isBrowser && window.location.protocol === "https:");

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

const setVolatileValue = (name, value) => {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(getStorageKey(name), String(value ?? ""));
  } catch {
    // ignore storage quota/unavailable errors
  }
};

const getVolatileValue = (name) => {
  if (!isBrowser) return null;
  try {
    const value = window.sessionStorage.getItem(getStorageKey(name));
    return value == null ? null : value;
  } catch {
    return null;
  }
};

const removeVolatileValue = (name) => {
  if (!isBrowser) return;
  try {
    window.sessionStorage.removeItem(getStorageKey(name));
  } catch {
    // ignore storage errors
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

export const setCookie = (name, value, options = {}) => {
  if (!isBrowser) return;
  if (isBlockedAuthCookieWrite(name)) {
    // Auth cookies are backend-managed. Frontend must not write or cache them.
    emitCookieChange(name);
    return;
  }

  if (!usesRealCookie(name)) {
    setVolatileValue(name, value);
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
  if (isAuthCookieName(name) && key !== "csrf_token_property") return;
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
  const csrfCookieKeys = ["csrf_token"];
  for (const key of csrfCookieKeys) {
    clearRealCookieOnly(key);
    removeVolatileValue(key);
    emitCookieChange(key);
  }
};

export const clearPreAuthCsrfCookies = () => {
  if (!isBrowser) return;
  // Login page cleanup for stale, unauthenticated CSRF context only.
  const csrfCookieKeys = [
    "csrf_token",
    "csrf-token",
    "XSRF-TOKEN",
    "XSRF_TOKEN",
    "xsrf-token",
    "_csrf",
  ];
  for (const key of csrfCookieKeys) {
    clearRealCookieOnly(key);
    removeVolatileValue(key);
    emitCookieChange(key);
  }
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
