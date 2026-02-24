const DEV_API_URL = process.env.NEXT_PUBLIC_DEV_URL || "";
const CENTRAL_API_URL = process.env.NEXT_PUBLIC_CENTRAL_URL || "";
const LOCAL_API_FALLBACK_URL = "https://dev.seaneb.com/api/v1";

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
const PRIMARY_API_URL = NEXT_ENV === "development" ? DEV_API_URL : CENTRAL_API_URL;
const SECONDARY_API_URL = NEXT_ENV === "development" ? CENTRAL_API_URL : DEV_API_URL;
const ENV_SELECTED_API_URL = isUsableUrl(PRIMARY_API_URL)
  ? PRIMARY_API_URL
  : SECONDARY_API_URL;

const RAW_API_BASE_URL =
  process.env.API_URL ||
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  ENV_SELECTED_API_URL;

const resolvedRemoteBaseUrl = isUsableUrl(RAW_API_BASE_URL)
  ? RAW_API_BASE_URL
  : isUsableUrl(SECONDARY_API_URL)
    ? SECONDARY_API_URL
    : LOCAL_API_FALLBACK_URL;

export const API_REMOTE_BASE_URL = normalizeUrl(resolvedRemoteBaseUrl);
const normalizedSecondaryBaseUrl = normalizeUrl(
  isUsableUrl(SECONDARY_API_URL) ? SECONDARY_API_URL : LOCAL_API_FALLBACK_URL
);
export const API_REMOTE_FALLBACK_BASE_URL =
  normalizedSecondaryBaseUrl === API_REMOTE_BASE_URL
    ? normalizeUrl(LOCAL_API_FALLBACK_URL)
    : normalizedSecondaryBaseUrl;
export const API_REMOTE_CANDIDATE_BASE_URLS = Array.from(
  new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
);

// Browser requests should go through same-origin /api rewrite to avoid CORS
// and preserve auth token/cookie flow.
export const API_BASE_URL =
  typeof window !== "undefined" ? "/api" : API_REMOTE_BASE_URL;
