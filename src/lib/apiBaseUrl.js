const DEV_API_URL =
  process.env.API_DEV_URL ||
  process.env.NEXT_PUBLIC_API_DEV_URL ||
  "https://dev.seaneb.com/api/v1";
const CENTRAL_API_URL =
  process.env.API_CENTRAL_URL ||
  process.env.NEXT_PUBLIC_API_CENTRAL_URL ||
  "https://central-api.seaneb.com/api/v1";

const NODE_ENV = String(process.env.NODE_ENV || "").trim();
const ENV_SELECTED_API_URL = NODE_ENV === "development" ? DEV_API_URL : CENTRAL_API_URL;

const RAW_API_BASE_URL =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  ENV_SELECTED_API_URL;

export const API_REMOTE_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");

// Browser requests should go through same-origin /api rewrite to avoid CORS
// and preserve auth token/cookie flow.
export const API_BASE_URL =
  typeof window !== "undefined" ? "/api" : API_REMOTE_BASE_URL;
