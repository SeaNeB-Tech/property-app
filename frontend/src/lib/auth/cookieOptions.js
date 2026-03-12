export const sanitizeCookieDomain = (domain) => {
  const raw = String(domain || "").trim();
  if (!raw) return "";
  return raw.replace(/:\d+$/, "");
};

const readProto = (request) => {
  const forwardedProto = String(request?.headers?.get?.("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) return forwardedProto;
  const nextProto = String(request?.nextUrl?.protocol || "").trim().toLowerCase();
  if (nextProto) return nextProto.replace(":", "");
  return "http";
};

const isIpHost = (host) => {
  if (!host) return false;
  const value = String(host || "").trim().toLowerCase();
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
  const isIpv6 = value.includes(":");
  return isIpv4 || isIpv6;
};

const readHost = (request) =>
  String(request?.headers?.get?.("host") || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

const parseHostList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);

const LOCAL_HOSTS = parseHostList(
  process.env.COOKIE_LOCAL_HOSTS || process.env.NEXT_PUBLIC_COOKIE_LOCAL_HOSTS
);

const isHostInLocalAllowlist = (host) => {
  if (!host) return false;
  const value = String(host || "").trim().toLowerCase();
  if (!LOCAL_HOSTS.length) return false;
  return LOCAL_HOSTS.includes(value);
};

const isSingleLabelHost = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/^\./, "");
  if (!normalized) return true;
  return !normalized.includes(".");
};

const isValidCookieDomain = (domain) => {
  if (!domain) return false;
  const normalized = String(domain || "").trim().toLowerCase().replace(/^\./, "");
  if (!normalized) return false;
  if (isIpHost(normalized)) return false;
  if (isSingleLabelHost(normalized)) return false;
  return true;
};

const resolveCookieDomain = (request) => {
  const envDomain = sanitizeCookieDomain(process.env.NEXT_PUBLIC_COOKIE_DOMAIN || "");
  if (!isValidCookieDomain(envDomain)) return "";

  const host = readHost(request);

  if (!host) return envDomain;
  if (isHostInLocalAllowlist(host)) return "";

  const bareEnv = envDomain.startsWith(".") ? envDomain.slice(1) : envDomain;
  if (host === bareEnv || host.endsWith(`.${bareEnv}`)) {
    return envDomain;
  }

  return "";
};

export const getCookieOptions = (request) => {
  const proto = readProto(request);
  const host = readHost(request);
  const isHttp = proto.startsWith("http") && !proto.startsWith("https");
  const forceSecure =
    process.env.NODE_ENV === "production" &&
    host &&
    !isHostInLocalAllowlist(host);
  const secure = forceSecure ? true : !isHttp;
  return {
    sameSite: secure ? "None" : "Lax",
    secure,
    domain: resolveCookieDomain(request),
  };
};
