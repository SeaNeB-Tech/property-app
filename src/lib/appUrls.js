const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const normalizeLocalPort = (value, fromPort, toPort) => {
  const normalized = normalizeUrl(value);
  if (!normalized || process.env.NODE_ENV !== "development") return normalized;

  try {
    const parsed = new URL(normalized);
    const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (isLocalHost && parsed.port === fromPort) {
      parsed.port = toPort;
      return normalizeUrl(parsed.toString());
    }
  } catch {
    return normalized;
  }

  return normalized;
};

const defaultAuthAppUrl = "http://localhost:1002";
const defaultListingAppUrl = "http://localhost:1001";

export const AUTH_APP_BASE_URL = normalizeUrl(
  normalizeLocalPort(process.env.NEXT_PUBLIC_AUTH_APP_URL || defaultAuthAppUrl, "3000", "1002")
);

export const LISTING_APP_BASE_URL = normalizeUrl(
  normalizeLocalPort(process.env.NEXT_PUBLIC_LISTING_APP_URL || defaultListingAppUrl, "8877", "1001")
);

export const getAuthAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${AUTH_APP_BASE_URL}${safePath}`;
};

export const getListingAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${LISTING_APP_BASE_URL}${safePath}`;
};
