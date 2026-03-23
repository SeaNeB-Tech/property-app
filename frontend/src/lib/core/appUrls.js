const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const normalizeHost = (value) =>
  String(value || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
const IPV4_HOSTNAME_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const isLocalishHostname = (value) => {
  const hostname = normalizeHost(value);
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (IPV4_HOSTNAME_PATTERN.test(hostname)) return true;
  return hostname.includes(":");
};

const parseUrl = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
};

const getRuntimeLocation = () => {
  if (typeof window === "undefined" || !window.location) return null;
  return {
    protocol: String(window.location.protocol || "").trim(),
    hostname: String(window.location.hostname || "").trim(),
  };
};

const resolveRuntimeBaseUrl = (value) => {
  const configuredUrl = parseUrl(value);
  if (!configuredUrl) return normalizeUrl(value);

  const runtimeLocation = getRuntimeLocation();
  const configuredHost = normalizeHost(configuredUrl.hostname);
  const runtimeHost = normalizeHost(runtimeLocation?.hostname);

  if (
    runtimeLocation?.protocol &&
    runtimeHost &&
    configuredHost &&
    runtimeHost !== configuredHost &&
    isLocalishHostname(configuredHost)
  ) {
    const resolvedUrl = new URL(configuredUrl.toString());
    resolvedUrl.protocol = runtimeLocation.protocol;
    resolvedUrl.hostname = runtimeLocation.hostname;
    return normalizeUrl(resolvedUrl.toString());
  }

  return normalizeUrl(configuredUrl.toString());
};

const toOrigin = (value) => {
  const parsed = parseUrl(value);
  return parsed?.origin || "";
};

export const AUTH_APP_BASE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_APP_URL
);

export const LISTING_APP_BASE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_LISTING_URL
);

export const getAuthAppBaseUrl = () => resolveRuntimeBaseUrl(AUTH_APP_BASE_URL);

export const getListingAppBaseUrl = () => resolveRuntimeBaseUrl(LISTING_APP_BASE_URL);

export const getAuthAppOrigin = () => toOrigin(getAuthAppBaseUrl());

export const getListingAppOrigin = () => toOrigin(getListingAppBaseUrl());

export const getAuthAppUrl = (path = "/") => {
  const baseUrl = getAuthAppBaseUrl();
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return baseUrl ? `${baseUrl}${safePath}` : safePath;
};

export const getListingAppUrl = (path = "/") => {
  const baseUrl = getListingAppBaseUrl();
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return baseUrl ? `${baseUrl}${safePath}` : safePath;
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
