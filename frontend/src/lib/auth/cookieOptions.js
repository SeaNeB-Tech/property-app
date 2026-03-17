/**
 * Sanitize cookie domain by removing port
 */
export const sanitizeCookieDomain = (domain) => {
  const raw = String(domain || "").trim();
  if (!raw) return "";
  return raw.replace(/:\d+$/, "");
};

/**
 * Read protocol from request safely
 */
const readProto = (request) => {
  try {
    const forwardedProto = String(request?.headers?.get?.("x-forwarded-proto") || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (forwardedProto) return forwardedProto;
    
    const nextProto = String(request?.nextUrl?.protocol || "").trim().toLowerCase();
    if (nextProto) return nextProto.replace(":", "");
  } catch {
    // Ignore errors
  }
  return "http";
};

/**
 * Validate if host is a valid IP address
 */
const isIpHost = (host) => {
  try {
    if (!host) return false;
    const value = String(host).trim().toLowerCase();
    
    // IPv4 validation with octet range check
    const ipv4Parts = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Parts) {
      for (let i = 1; i <= 4; i++) {
        const octet = parseInt(ipv4Parts[i], 10);
        if (octet < 0 || octet > 255) return false;
      }
      return true;
    }
    
    // IPv6 check (simplified - has colon and at least 3 parts)
    return value.includes(":") && value.split(":").length >= 3;
  } catch {
    return false;
  }
};

/**
 * Read host from request safely
 */
const readHost = (request) => {
  try {
    return String(request?.headers?.get?.("host") || "")
      .trim()
      .toLowerCase()
      .replace(/:\d+$/, "");
  } catch {
    return "";
  }
};

/**
 * Parse comma-separated host list
 */
const parseHostList = (value) => {
  try {
    return String(value || "")
      .split(",")
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
};

// Local hosts allowlist
const LOCAL_HOSTS = parseHostList(
  process.env.COOKIE_LOCAL_HOSTS || process.env.NEXT_PUBLIC_COOKIE_LOCAL_HOSTS
);

/**
 * Check if host is in local allowlist
 */
const isHostInLocalAllowlist = (host) => {
  try {
    if (!host || !LOCAL_HOSTS.length) return false;
    const value = String(host).trim().toLowerCase();
    return LOCAL_HOSTS.includes(value);
  } catch {
    return false;
  }
};

/**
 * Check if host is single-label (no dots)
 * Returns false for empty strings
 */
const isSingleLabelHost = (value) => {
  try {
    const normalized = String(value || "").trim().toLowerCase().replace(/^\./, "");
    return normalized ? !normalized.includes(".") : false;
  } catch {
    return false;
  }
};

/**
 * Validate if domain can be used for cookies
 * Browsers reject cookies for IPs, localhost, and single-label domains
 */
const isValidCookieDomain = (domain) => {
  try {
    if (!domain) return false;
    
    const normalized = String(domain).trim().toLowerCase().replace(/^\./, "");
    if (!normalized) return false;
    
    // Reject IP addresses
    if (isIpHost(normalized)) return false;
    
    // Reject single-label hosts (localhost, etc.)
    if (isSingleLabelHost(normalized)) return false;
    
    // Must have at least one dot
    return normalized.includes(".");
  } catch {
    return false;
  }
};

/**
 * Resolve the appropriate cookie domain for the request
 */
const resolveCookieDomain = (request) => {
  try {
    // Get configured domain from env
    const envDomain = sanitizeCookieDomain(process.env.NEXT_PUBLIC_COOKIE_DOMAIN || "");
    
    // Validate env domain
    if (!isValidCookieDomain(envDomain)) return "";
    
    const host = readHost(request);
    if (!host) return envDomain;
    
    // Don't set domain for local allowlist hosts
    if (isHostInLocalAllowlist(host)) return "";
    
    // Check if host matches env domain (with or without subdomain)
    const bareEnv = envDomain.startsWith(".") ? envDomain.slice(1) : envDomain;
    if (host === bareEnv || host.endsWith(`.${bareEnv}`)) {
      return envDomain;
    }
    
    return "";
  } catch {
    return "";
  }
};

/**
 * Get cookie options for the request
 */
export const getCookieOptions = (request) => {
  try {
    const proto = readProto(request);
    const host = readHost(request);
    
    // Determine if connection is HTTP
    const isHttp = proto.startsWith("http") && !proto.startsWith("https");

    // Respect the actual request scheme to avoid Secure cookies on HTTP.
    const secure = !isHttp;
    
    // SameSite: None for secure, Lax for insecure
    const sameSite = secure ? "None" : "Lax";
    
    // Get domain if applicable
    const domain = resolveCookieDomain(request);
    
    return {
      sameSite,
      secure,
      ...(domain && { domain }) // Only include domain if non-empty
    };
  } catch {
    // Fallback options
    return {
      sameSite: "Lax",
      secure: false,
    };
  }
};
