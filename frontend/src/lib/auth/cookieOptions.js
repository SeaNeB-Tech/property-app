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

const resolveCookieDomain = (request) => {
  const envDomain = sanitizeCookieDomain(process.env.NEXT_PUBLIC_COOKIE_DOMAIN || "");
  if (!envDomain) return "";

  const host = String(request?.headers?.get?.("host") || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

  if (!host) return envDomain;
  if (host === "localhost" || host.endsWith(".local") || isIpHost(host)) return "";

  const bareEnv = envDomain.startsWith(".") ? envDomain.slice(1) : envDomain;
  if (host === bareEnv || host.endsWith(`.${bareEnv}`)) {
    return envDomain;
  }

  return "";
};

export const getCookieOptions = (request) => {
  const proto = readProto(request);
  const isHttp = proto.startsWith("http") && !proto.startsWith("https");
  return {
    sameSite: isHttp ? "Lax" : "None",
    secure: !isHttp,
    domain: resolveCookieDomain(request),
  };
};

