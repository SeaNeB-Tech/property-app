// Simple cookie helper for storing JSON and string values
const isBrowser = typeof window !== "undefined";

const envCookiePath = process.env.NEXT_PUBLIC_COOKIE_PATH || "/";
const envCookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || "";
const envSameSite = process.env.NEXT_PUBLIC_COOKIE_SAMESITE || "Lax";
const COOKIE_CHANGE_EVENT = "seaneb:cookie-change";

const normalizePath = (path) => {
  if (!path || typeof path !== "string") return "/";
  return path.startsWith("/") ? path : `/${path}`;
};

const resolveDomain = (domain) => {
  const safeDomain = String(domain || "").trim();
  if (!safeDomain || !isBrowser) return safeDomain;

  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost");

  // Domain cookies on localhost often break auth sharing in local multi-port setup.
  if (isLocalHost) return "";
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

export const setCookie = (name, value, options = {}) => {
  if (!isBrowser) return;
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
  const pairs = document.cookie.split("; ");
  for (const p of pairs) {
    if (!p) continue;
    // FIX: Split only on the FIRST "=" to handle values that contain "="
    const eqIndex = p.indexOf("=");
    if (eqIndex < 0) continue;
    const k = p.substring(0, eqIndex);
    const v = p.substring(eqIndex + 1);
    if (decodeURIComponent(k) === name) return decodeURIComponent(v || "");
  }
  return null;
};

export const removeCookie = (name, options = {}) => {
  if (!isBrowser) return;
  const { path, domain, sameSite, secure } = resolveCookieOptions(options);
  let cookie = `${encodeURIComponent(name)}=; path=${path}; max-age=0`;
  if (domain) cookie += `; domain=${domain}`;
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  if (secure) cookie += "; Secure";
  document.cookie = cookie;
  emitCookieChange(name);
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
