const DEV_API_URL = process.env.NEXT_PUBLIC_DEV_URL || "";
const CENTRAL_API_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || "";
const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const isUsableUrl = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

const NEXT_ENV = String(process.env.NEXT_ENV || "").trim().toLowerCase();
const API_BASE =
  NEXT_ENV === "development" ? DEV_API_URL : CENTRAL_API_URL;
const API_FALLBACK =
  NEXT_ENV === "development" ? CENTRAL_API_URL : DEV_API_URL;

export const API_REMOTE_BASE_URL = normalizeUrl(API_BASE);
export const API_REMOTE_FALLBACK_BASE_URL =
  normalizeUrl(API_FALLBACK) === API_REMOTE_BASE_URL
    ? ""
    : normalizeUrl(API_FALLBACK);
export const API_REMOTE_CANDIDATE_BASE_URLS = Array.from(
  new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
);

const normalizedPublicApiBase = String(PUBLIC_API_BASE_URL || "").trim();
const browserBase =
  normalizedPublicApiBase && normalizedPublicApiBase !== "/"
    ? (isUsableUrl(normalizedPublicApiBase)
        ? normalizeUrl(normalizedPublicApiBase)
        : normalizedPublicApiBase)
    : "/api";

// Browser defaults to same-origin /api for cookie-safe auth flow.
// Can be overridden via NEXT_PUBLIC_API_BASE_URL if needed.
export const API_BASE_URL = typeof window !== "undefined" ? browserBase : API_REMOTE_BASE_URL;
