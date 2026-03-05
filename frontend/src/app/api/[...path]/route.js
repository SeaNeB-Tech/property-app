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

const resolveBearerFromCookies = (cookieHeader) => {
  const rawToken = getCookieValueFromHeader(cookieHeader, "access_token");
  if (!rawToken) return "";
  try {
    return decodeURIComponent(rawToken);
  } catch {
    return rawToken;
  }
};

const resolveCsrfHeaderValue = (incomingHeader, cookieHeader) => {
  const fromHeader = String(incomingHeader || "").trim();
  if (fromHeader) return fromHeader;
  const fromCookieRaw = getCookieValueFromHeader(cookieHeader, "csrf_token_property");
  if (!fromCookieRaw) return "";
  try {
    return decodeURIComponent(fromCookieRaw);
  } catch {
    return fromCookieRaw;
  }
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
    nextHeaders.append("set-cookie", cookie);
  }

  return nextHeaders;
};

const readAccessTokenFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || data?.tokens || payload?.token || payload?.tokens || {};
  const headerAuth = String(
    headers?.get("authorization") ||
      headers?.get("Authorization") ||
      ""
  ).trim();
  const responseHeaderToken = /^bearer\s+/i.test(headerAuth)
    ? headerAuth.replace(/^bearer\s+/i, "").trim()
    : headerAuth;
  return String(
    payload?.accessToken ||
      payload?.access_token ||
      data?.accessToken ||
      data?.access_token ||
      tokenObj?.accessToken ||
      tokenObj?.access_token ||
      tokenObj?.token ||
      tokenObj?.jwt ||
      payload?.jwt ||
      data?.jwt ||
      responseHeaderToken ||
      ""
  ).trim();
};

const readRefreshTokenFromPayload = (payload = {}) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
  return String(
    payload?.refreshToken ||
      payload?.refresh_token ||
      data?.refreshToken ||
      data?.refresh_token ||
      tokenObj?.refreshToken ||
      tokenObj?.refresh_token ||
      ""
  ).trim();
};

const readCsrfTokenFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  return String(
    payload?.csrfToken ||
      payload?.csrf_token ||
      data?.csrfToken ||
      data?.csrf_token ||
      headers?.get("x-csrf-token") ||
      headers?.get("csrf-token") ||
      headers?.get("x-xsrf-token") ||
      ""
  ).trim();
};

const readExpiresInFromPayload = (payload = {}) => {
  const data = payload?.data || {};
  const raw = payload?.expiresIn ?? payload?.expires_in ?? data?.expiresIn ?? data?.expires_in;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildSetCookieHeader = ({
  name,
  value,
  httpOnly = false,
  maxAge = null,
}) => {
  const safeName = encodeURIComponent(String(name || "").trim());
  const safeValue = encodeURIComponent(String(value || "").trim());
  if (!safeName || !safeValue) return "";
  const parts = [`${safeName}=${safeValue}`, "Path=/", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  if (typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0) {
    parts.push(`Max-Age=${Math.floor(maxAge)}`);
  }
  return parts.join("; ");
};

const shouldHydrateAuthCookies = (segments = []) => {
  const key = Array.isArray(segments)
    ? segments.map((part) => String(part || "").trim().toLowerCase()).join("/")
    : "";
  return (
    key === "auth/refresh" ||
    key === "auth/login" ||
    key === "otp/verify-otp" ||
    key === "auth/verify-otp" ||
    key === "auth/otp/verify" ||
    key === "auth/otp/verify-otp"
  );
};

const toProxyResponse = async (upstreamResponse, pathSegments = []) => {
  const responseHeaders = copyHeadersPreservingSetCookie(upstreamResponse.headers);

  if (!shouldHydrateAuthCookies(pathSegments)) {
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  }

  const contentType = String(upstreamResponse.headers.get("content-type") || "").toLowerCase();
  const isJson = contentType.includes("application/json");
  const payloadText = await upstreamResponse.text();

  if (!isJson || !upstreamResponse.ok || !payloadText) {
    return new Response(payloadText, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  }

  let payload = null;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    payload = null;
  }

  if (payload && typeof payload === "object") {
    const expiresIn = readExpiresInFromPayload(payload);
    const accessToken = readAccessTokenFromPayload(payload, upstreamResponse.headers);
    if (accessToken) {
      const cookie = buildSetCookieHeader({
        name: "access_token",
        value: accessToken,
        httpOnly: true,
        maxAge: expiresIn != null ? Math.max(1, expiresIn) : null,
      });
      if (cookie) responseHeaders.append("set-cookie", cookie);
    }

    const refreshToken = readRefreshTokenFromPayload(payload);
    if (refreshToken) {
      const cookie = buildSetCookieHeader({
        name: "refresh_token_property",
        value: refreshToken,
        httpOnly: true,
      });
      if (cookie) responseHeaders.append("set-cookie", cookie);
    }

    const csrfToken = readCsrfTokenFromPayload(payload, upstreamResponse.headers);
    if (csrfToken) {
      const cookie = buildSetCookieHeader({
        name: "csrf_token_property",
        value: csrfToken,
        httpOnly: false,
      });
      if (cookie) responseHeaders.append("set-cookie", cookie);
    }
  }

  return new Response(payloadText, {
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
  const incomingCookie = String(incomingHeaders.get("cookie") || "").trim();
  const resolvedCsrf = resolveCsrfHeaderValue(
    String(incomingHeaders.get("x-csrf-token") || "").trim(),
    incomingCookie
  );
  const existingAuthorization = String(
    incomingHeaders.get("authorization") || incomingHeaders.get("Authorization") || ""
  ).trim();
  const cookieAccessToken = resolveBearerFromCookies(incomingCookie);
  if (resolvedCsrf) {
    incomingHeaders.set("x-csrf-token", resolvedCsrf);
  }
  if (!existingAuthorization && cookieAccessToken) {
    incomingHeaders.set("authorization", `Bearer ${cookieAccessToken}`);
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
          return toProxyResponse(response, pathSegments);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("Proxy request failed");
        if (!shouldTryNextBase(lastError)) break;
      }
    }
  }

  if (lastResponse) {
    return toProxyResponse(lastResponse, lastPathSegments);
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
