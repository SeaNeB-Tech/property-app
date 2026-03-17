const DEV_API_URL =
  process.env.NEXT_PUBLIC_DEV_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const CENTRAL_API_URL =
  process.env.NEXT_PUBLIC_CENTRAL_URL ||
  process.env.NEXT_PUBLIC_CENTRAL_API_URL ||
  "";

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const normalizeBasePath = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
};
const resolveClientBasePath = () => {
  const envBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || "");
  if (envBasePath) return envBasePath;
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

// Choose exactly one API base depending on environment (no fallback to the other server).
const NEXT_ENV = String(process.env.NEXT_ENV || process.env.EXT_ENV || "")
  .trim()
  .toLowerCase();
const API_BASE = NEXT_ENV === "development" ? DEV_API_URL : CENTRAL_API_URL;

const API_REMOTE_CANDIDATES = Array.from(
  new Set([API_BASE].filter(Boolean).map(normalizeUrl).filter(isUsableUrl))
);

export const API_REMOTE_BASE_URL = API_REMOTE_CANDIDATES[0] || "";
export const API_REMOTE_FALLBACK_BASE_URL = API_REMOTE_CANDIDATES[1] || "";
export const API_REMOTE_CANDIDATE_BASE_URLS = API_REMOTE_CANDIDATES;

// In browser:
// - For localhost/dev-machine, use same-origin proxy (/api) so cookies work without CORS surprises.
// - For deployed environments (dev/staging/prod), call the selected remote API base directly.
const CLIENT_BASE_PATH =
  typeof window !== "undefined"
    ? resolveClientBasePath()
    : normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || "");

const isLocalHost = () => {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").trim().toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("127.");
};

export const API_BASE_URL =
  typeof window !== "undefined"
    ? isLocalHost()
      ? `${CLIENT_BASE_PATH}/api`
      : API_REMOTE_BASE_URL
    : API_REMOTE_BASE_URL;
