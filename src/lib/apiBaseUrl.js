const RAW_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://dev.seaneb.com/api/v1";

export const API_REMOTE_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");

// Browser requests should go through same-origin /api rewrite to avoid CORS
// and preserve auth token/cookie flow.
export const API_BASE_URL =
  typeof window !== "undefined" ? "/api" : API_REMOTE_BASE_URL;
