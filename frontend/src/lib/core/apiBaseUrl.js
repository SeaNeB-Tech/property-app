const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "";
const DEV_API_URL = process.env.NEXT_PUBLIC_DEV_URL || "";
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
const isUsableUrl = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

const NEXT_ENV = String(process.env.NEXT_ENV || "").trim().toLowerCase();
const API_BASE = NEXT_ENV === "development" ? DEV_API_URL : CENTRAL_API_URL;
const API_FALLBACK = NEXT_ENV === "development" ? CENTRAL_API_URL : DEV_API_URL;

const API_PRIMARY_CANDIDATES = [BACKEND_API_URL, API_BASE, API_FALLBACK].filter(Boolean);
const API_REMOTE_CANDIDATES = Array.from(
  new Set(API_PRIMARY_CANDIDATES.map(normalizeUrl).filter(isUsableUrl))
);

export const API_REMOTE_BASE_URL = API_REMOTE_CANDIDATES[0] || "";
export const API_REMOTE_FALLBACK_BASE_URL = API_REMOTE_CANDIDATES[1] || "";
export const API_REMOTE_CANDIDATE_BASE_URLS = API_REMOTE_CANDIDATES;

// In browser, use same-origin proxy (/api) so SameSite=None cookies work in local development.
const CLIENT_BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || "");
export const API_BASE_URL =
  typeof window !== "undefined" ? `${CLIENT_BASE_PATH}/api` : API_REMOTE_BASE_URL;
