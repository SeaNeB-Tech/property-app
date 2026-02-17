// Simple cookie helper for storing JSON and string values
const isBrowser = typeof window !== "undefined";

export const setCookie = (name, value, options = {}) => {
  if (!isBrowser) return;
  const { maxAge, path = "/", sameSite = "Lax", secure } = options; // seconds
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path}`;
  if (typeof maxAge === "number") cookie += `; max-age=${maxAge}`;
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  const shouldUseSecure = typeof secure === "boolean" ? secure : window.location.protocol === "https:";
  if (shouldUseSecure) cookie += "; Secure";
  document.cookie = cookie;
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

export const removeCookie = (name) => {
  if (!isBrowser) return;
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0`;
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
