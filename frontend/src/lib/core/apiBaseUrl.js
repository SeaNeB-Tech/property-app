const DEV_API_URL = process.env.NEXT_PUBLIC_DEV_URL || "";
const CENTRAL_API_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || "";
const DEFAULT_FALLBACK_URL = "https://central-api.seaneb.com/api/v1";

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const normalizeApiUrl = (value) => {
  const raw = normalizeUrl(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const path = String(url.pathname || "").replace(/\/+$/, "");
    if (!/\/api\/v1$/i.test(path)) {
      const nextPath = `${path}/api/v1`.replace(/\/+/g, "/");
      url.pathname = nextPath;
    }
    return normalizeUrl(url.toString());
  } catch {
    return raw.endsWith("/api/v1") ? raw : `${raw}/api/v1`;
  }
};
const normalizeBasePath = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
};
const resolveClientBasePath = () => {
  if (typeof window !== "undefined") {
    const nextData = window.__NEXT_DATA__ || {};
    const dataBasePath = normalizeBasePath(nextData?.basePath || "");
    if (dataBasePath) return dataBasePath;
  }
  return "";
};
const isUsableUrl = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

const NEXT_ENV = String(process.env.NEXT_ENV || "")
  .trim()
  .toLowerCase();
const API_BASE =
  NEXT_ENV === "development"
    ? DEV_API_URL || CENTRAL_API_URL
    : CENTRAL_API_URL || DEV_API_URL;
const API_FALLBACK =
  NEXT_ENV === "development"
    ? CENTRAL_API_URL || DEV_API_URL
    : DEV_API_URL || CENTRAL_API_URL;

const pushUnique = (list, value) => {
  const normalized = normalizeApiUrl(value);
  if (!isUsableUrl(normalized)) return;
  if (!list.includes(normalized)) list.push(normalized);
};

const API_REMOTE_CANDIDATES = [];
pushUnique(API_REMOTE_CANDIDATES, API_BASE);
pushUnique(API_REMOTE_CANDIDATES, API_FALLBACK);
pushUnique(API_REMOTE_CANDIDATES, CENTRAL_API_URL);
pushUnique(API_REMOTE_CANDIDATES, DEV_API_URL);

if (!API_REMOTE_CANDIDATES.length) {
  pushUnique(API_REMOTE_CANDIDATES, DEFAULT_FALLBACK_URL);
}

export const API_REMOTE_BASE_URL = API_REMOTE_CANDIDATES[0] || "";
export const API_REMOTE_FALLBACK_BASE_URL = API_REMOTE_CANDIDATES[1] || "";
export const API_REMOTE_CANDIDATE_BASE_URLS = API_REMOTE_CANDIDATES;

// In browser:
// Always use same-origin proxy (/api) so auth cookies (SameSite/Secure/Domain)
// behave consistently on localhost, dev ports, and production domains.
const CLIENT_BASE_PATH =
  typeof window !== "undefined"
    ? resolveClientBasePath()
    : "";

export const API_BASE_URL =
  typeof window !== "undefined"
    ? `${CLIENT_BASE_PATH}/api`
    : API_REMOTE_BASE_URL;
