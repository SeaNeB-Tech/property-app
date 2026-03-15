import { CSRF_COOKIE_KEYS } from "@/lib/auth/cookieKeys";

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
const OTP_RATE_LIMIT_WINDOW_MS = 60_000;
const OTP_RATE_LIMIT_MAX = 6;
const otpRateLimitStore = new Map();

const isUsableUrl = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

const getApiBaseCandidates = () => {
  const nextEnv = String(process.env.NEXT_ENV || "").trim().toLowerCase();
  const directApiUrl = normalizeUrl(
    process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      ""
  );
  const devApiUrl = normalizeUrl(process.env.NEXT_PUBLIC_DEV_URL || "");
  const centralApiUrl = normalizeUrl(
    process.env.NEXT_PUBLIC_CENTRAL_URL || process.env.NEXT_PUBLIC_CENTRAL_API_URL || ""
  );

  const primary = nextEnv === "development" ? devApiUrl : centralApiUrl;
  const fallback = nextEnv === "development" ? centralApiUrl : devApiUrl;

  return Array.from(new Set([directApiUrl, primary, fallback].filter(isUsableUrl)));
};

const buildTargetUrl = (baseUrl, pathSegments = [], search = "") => {
  const cleanPath = Array.isArray(pathSegments)
    ? pathSegments.map((part) => encodeURIComponent(String(part || ""))).join("/")
    : "";
  const query = String(search || "");
  return `${normalizeUrl(baseUrl)}/${cleanPath}${query}`;
};

const normalizeProxyPathSegments = (segments = []) => {
  const path = Array.isArray(segments) ? segments.map((s) => String(s || "").trim()) : [];
  const apiBaseEndsWithV1 = getApiBaseCandidates().some((base) => /\/api\/v1$/i.test(base));
  const normalizedPath =
    apiBaseEndsWithV1 && String(path[0] || "").toLowerCase() === "v1" ? path.slice(1) : path;

  return normalizedPath;
};

const buildProxyPathVariants = (segments = []) => {
  const basePath = normalizeProxyPathSegments(segments);
  const key = basePath.join("/").toLowerCase();
  const variants = [basePath];

  // Some backend deployments expose OTP verification under /auth/verify-otp
  // while others use /otp/verify-otp. Try both before failing.
  if (key === "otp/verify-otp") {
    variants.push(["auth", "verify-otp"]);
    variants.push(["auth", "otp", "verify-otp"]);
  } else if (key === "auth/verify-otp") {
    variants.push(["otp", "verify-otp"]);
    variants.push(["auth", "otp", "verify-otp"]);
  } else if (key === "otp/send-otp") {
    variants.push(["auth", "send-otp"]);
    variants.push(["auth", "otp", "send-otp"]);
  } else if (key === "auth/send-otp") {
    variants.push(["otp", "send-otp"]);
    variants.push(["auth", "otp", "send-otp"]);
  } else if (key === "auth/otp/send-otp") {
    variants.push(["otp", "send-otp"]);
    variants.push(["auth", "send-otp"]);
  } else if (key === "auth/otp/send") {
    variants.push(["otp", "send-otp"]);
    variants.push(["auth", "send-otp"]);
  } else if (key === "auth/otp/verify-otp") {
    variants.push(["otp", "verify-otp"]);
    variants.push(["auth", "verify-otp"]);
  } else if (key === "auth/otp/verify") {
    variants.push(["otp", "verify-otp"]);
    variants.push(["auth", "verify-otp"]);
  }

  return variants;
};

const getClientIdentity = (request) => {
  const xff = String(request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const realIp = String(request.headers.get("x-real-ip") || "").trim();
  const ua = String(request.headers.get("user-agent") || "").trim();
  return `${xff || realIp || "unknown"}|${ua || "ua"}`;
};

const isOtpSensitivePath = (segments = []) => {
  const key = Array.isArray(segments)
    ? segments.map((part) => String(part || "").trim().toLowerCase()).join("/")
    : "";
  return [
    "otp/send-otp",
    "otp/verify-otp",
    "auth/verify-otp",
    "auth/otp/send-otp",
    "auth/otp/verify-otp",
    "auth/otp/send",
    "auth/otp/verify",
    "auth/email/send-otp",
    "auth/email/verify-otp",
  ].includes(key);
};

const consumeOtpRateLimit = ({ request, pathSegments }) => {
  if (String(request.method || "").toUpperCase() !== "POST") return { allowed: true, retryAfter: 0 };
  if (!isOtpSensitivePath(pathSegments)) return { allowed: true, retryAfter: 0 };

  const now = Date.now();
  for (const [key, bucket] of otpRateLimitStore.entries()) {
    if (!bucket || Number(bucket.resetAt || 0) <= now) {
      otpRateLimitStore.delete(key);
    }
  }

  const identity = getClientIdentity(request);
  const routeKey = Array.isArray(pathSegments) ? pathSegments.join("/").toLowerCase() : "otp";
  const bucketKey = `${identity}|${routeKey}`;
  const existing = otpRateLimitStore.get(bucketKey);
  if (!existing || Number(existing.resetAt || 0) <= now) {
    otpRateLimitStore.set(bucketKey, { count: 1, resetAt: now + OTP_RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= OTP_RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfter };
  }

  existing.count += 1;
  otpRateLimitStore.set(bucketKey, existing);
  return { allowed: true, retryAfter: 0 };
};

const readBody = async (request) => {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  return request.text();
};

const getCookieValueFromHeader = (cookieHeader, key) => {
  const source = String(cookieHeader || "");
  if (!source) return "";
  const parts = source.split("; ");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== key) continue;
    return part.slice(idx + 1).trim();
  }
  return "";
};

const stripCookieKeysFromHeader = (cookieHeader, keys = []) => {
  const source = String(cookieHeader || "").trim();
  if (!source) return "";
  const blocked = new Set(keys.map((key) => String(key || "").trim()).filter(Boolean));
  return source
    .split(";")
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .filter((part) => {
      const idx = part.indexOf("=");
      const name = idx >= 0 ? part.slice(0, idx).trim() : part;
      return !blocked.has(name);
    })
    .join("; ");
};

const resolveCsrfHeaderValue = (incomingHeader, cookieHeader, cookieStore = null) => {
  const fromHeader = String(incomingHeader || "").trim();
  if (fromHeader) return fromHeader;
  for (const key of CSRF_COOKIE_KEYS) {
    const fromStore = String(cookieStore?.get?.(key)?.value || "").trim();
    if (fromStore) {
      try {
        return decodeURIComponent(fromStore);
      } catch {
        return fromStore;
      }
    }
  }
  for (const key of CSRF_COOKIE_KEYS) {
    const fromCookieRaw = getCookieValueFromHeader(cookieHeader, key);
    if (!fromCookieRaw) continue;
    try {
      return decodeURIComponent(fromCookieRaw);
    } catch {
      return fromCookieRaw;
    }
  }
  return "";
};

const copyHeadersPreservingSetCookie = (upstreamHeaders) => {
  const nextHeaders = new Headers(upstreamHeaders);
  nextHeaders.delete("content-length");
  nextHeaders.delete("content-encoding");
  nextHeaders.delete("transfer-encoding");
  nextHeaders.delete("set-cookie");

  const getSetCookie = upstreamHeaders?.getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(upstreamHeaders) || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
      if (/^\s*access_token=/i.test(cookie)) continue;
      nextHeaders.append("set-cookie", cookie);
    }
    return nextHeaders;
  }

  const combinedCookieHeader = String(upstreamHeaders?.get("set-cookie") || "").trim();
  if (!combinedCookieHeader) return nextHeaders;

  const splitCookies = combinedCookieHeader
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const cookie of splitCookies) {
    if (/^\s*access_token=/i.test(cookie)) continue;
    nextHeaders.append("set-cookie", cookie);
  }

  return nextHeaders;
};

const toProxyResponse = async (upstreamResponse, pathSegments = [], request = null) => {
  const responseHeaders = copyHeadersPreservingSetCookie(upstreamResponse.headers);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};

const forwardRequest = async (request, targetUrl, bodyText) => {
  const incomingHeaders = new Headers(request.headers);
  incomingHeaders.delete("host");
  incomingHeaders.delete("connection");
  incomingHeaders.delete("content-length");
  const incomingCookie = stripCookieKeysFromHeader(
    String(incomingHeaders.get("cookie") || "").trim(),
    ["access_token", "accessToken", "token"]
  );
  const resolvedCsrf = resolveCsrfHeaderValue(
    String(incomingHeaders.get("x-csrf-token") || "").trim(),
    incomingCookie,
    request.cookies
  );
  const existingAuthorization = String(
    incomingHeaders.get("authorization") || incomingHeaders.get("Authorization") || ""
  ).trim();
  if (incomingCookie) {
    incomingHeaders.set("cookie", incomingCookie);
  } else {
    incomingHeaders.delete("cookie");
  }
  if (resolvedCsrf) {
    incomingHeaders.set("x-csrf-token", resolvedCsrf);
    incomingHeaders.set("x-xsrf-token", resolvedCsrf);
    incomingHeaders.set("csrf-token", resolvedCsrf);
  }
  if (!existingAuthorization) {
    incomingHeaders.delete("authorization");
    incomingHeaders.delete("Authorization");
  }
  incomingHeaders.set("x-product-key", PRODUCT_KEY);

  return fetch(targetUrl, {
    method: request.method,
    headers: incomingHeaders,
    body: bodyText,
    credentials: "include",
    redirect: "manual",
    cache: "no-store",
  });
};

const shouldTryNextBase = (responseOrError) => {
  if (!responseOrError) return true;
  if (responseOrError instanceof Error) return true;
  const status = Number(responseOrError.status || 0);
  return status >= 500;
};

const proxyHandler = async (request, { params }) => {
  const baseCandidates = getApiBaseCandidates();
  if (baseCandidates.length === 0) {
    return Response.json(
      { error: { message: "API base URL is not configured" } },
      { status: 500 }
    );
  }

  const resolvedParams = await params;
  const pathVariants = buildProxyPathVariants(resolvedParams?.path || []);
  const primaryPathSegments = pathVariants[0] || [];
  const otpLimit = consumeOtpRateLimit({ request, pathSegments: primaryPathSegments });
  if (!otpLimit.allowed) {
    return Response.json(
      {
        error: {
          code: "OTP_RATE_LIMITED",
          message: "Too many OTP attempts. Please retry shortly.",
        },
      },
      {
        status: 429,
        headers: new Headers({
          "retry-after": String(otpLimit.retryAfter),
        }),
      }
    );
  }

  const bodyText = await readBody(request);
  const attempts = [];
  let lastResponse = null;
  let lastError = null;
  let lastPathSegments = [];

  for (const pathSegments of pathVariants) {
    for (const baseUrl of baseCandidates) {
      const targetUrl = buildTargetUrl(baseUrl, pathSegments, request.nextUrl.search);
      attempts.push(targetUrl);
      lastPathSegments = pathSegments;
      try {
        const response = await forwardRequest(request, targetUrl, bodyText);
        lastResponse = response;

        if (!shouldTryNextBase(response)) {
          return toProxyResponse(response, pathSegments, request);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("Proxy request failed");
        if (!shouldTryNextBase(lastError)) break;
      }
    }
  }

  if (lastResponse) {
    return toProxyResponse(lastResponse, lastPathSegments, request);
  }

  return Response.json(
    {
      error: {
        message: "API proxy failed",
        details: lastError?.message || "Unknown error",
        attempts,
      },
    },
    { status: 502 }
  );
};

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;
export const OPTIONS = proxyHandler;
export const HEAD = proxyHandler;
