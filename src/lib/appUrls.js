const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const defaultAuthAppUrl = "http://159.65.154.221:1002/";
const defaultListingAppUrl = "http://159.65.154.221:1001/";

export const AUTH_APP_BASE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_AUTH_APP_URL || defaultAuthAppUrl
);

export const LISTING_APP_BASE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_LISTING_APP_URL || defaultListingAppUrl
);

export const getAuthAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${AUTH_APP_BASE_URL}${safePath}`;
};

export const getListingAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${LISTING_APP_BASE_URL}${safePath}`;
};
