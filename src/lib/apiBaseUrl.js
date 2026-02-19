const RAW_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://dev.seaneb.com";

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");
