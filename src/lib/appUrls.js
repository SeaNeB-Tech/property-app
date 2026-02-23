const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const defaultAuthAppUrl = "http://159.65.154.221:1002";
const defaultListingAppUrl = "http://159.65.154.221:1001";

const normalizeAuthPort = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) return normalized;

  try {
    const parsed = new URL(normalized);
    // Backward compatibility: old auth port and accidental listing port.
    if (parsed.port === "3000" || parsed.port === "8877" || parsed.port === "1001") {
      parsed.port = "1002";
      return normalizeUrl(parsed.toString());
    }
  } catch {
    return normalized;
  }

  return normalized;
};

const normalizeListingPort = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) return normalized;

  try {
    const parsed = new URL(normalized);
    // Backward compatibility: old listing port and accidental app port.
    if (parsed.port === "3000" || parsed.port === "8877" || parsed.port === "1002") {
      parsed.port = "1001";
      return normalizeUrl(parsed.toString());
    }
  } catch {
    return normalized;
  }

  return normalized;
};

export const AUTH_APP_BASE_URL = normalizeAuthPort(process.env.NEXT_PUBLIC_AUTH_APP_URL || defaultAuthAppUrl);

export const LISTING_APP_BASE_URL = normalizeListingPort(process.env.NEXT_PUBLIC_LISTING_APP_URL || defaultListingAppUrl);

export const getAuthAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${AUTH_APP_BASE_URL}${safePath}`;
};

export const getListingAppUrl = (path = "/") => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${LISTING_APP_BASE_URL}${safePath}`;
};
