const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");

export const AUTH_APP_BASE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_AUTH_APP_URL
);

export const LISTING_APP_BASE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_APP_URL
);

export const getAuthAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${AUTH_APP_BASE_URL}${safePath}`;
};

export const getListingAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${LISTING_APP_BASE_URL}${safePath}`;
};

export const getAuthLoginUrl = ({ returnTo = "", source = "" } = {}) => {
  const base = getAuthAppUrl("/auth/login");
  const safeReturnTo = String(returnTo || "").trim();
  const safeSource = String(source || "").trim();

  if (!safeReturnTo && !safeSource) return base;

  const resolvedReturnTo = safeReturnTo.startsWith("/")
    ? getListingAppUrl(safeReturnTo)
    : safeReturnTo;

  const params = new URLSearchParams();
  if (safeSource) params.set("source", safeSource);
  if (resolvedReturnTo) params.set("returnTo", resolvedReturnTo);

  if (!params.toString()) return base;

  if (/^https?:\/\//i.test(base)) {
    const url = new URL(base);
    for (const [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${params.toString()}`;
};
