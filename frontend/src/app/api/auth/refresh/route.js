import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";
const REFRESH_COOKIE_NAME = "refresh_token_property";
const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
];

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

const getRequestHost = (request) =>
  String(request?.headers?.get("x-forwarded-host") || request?.headers?.get("host") || "").trim();

const getRequestProtocol = (request) => {
  const forwarded = String(request?.headers?.get("x-forwarded-proto") || "").trim().toLowerCase();
  if (forwarded) return forwarded;
  return String(request?.nextUrl?.protocol || "").replace(":", "").trim().toLowerCase();
};

const getCookieContext = (request) => ({
  host: getRequestHost(request),
  isSecure: getRequestProtocol(request) === "https",
});

const normalizeHost = (host) => String(host || "").trim().replace(/:\d+$/, "").toLowerCase();

const isIpHost = (host) => {
  const value = normalizeHost(host);
  if (!value) return false;
  if (value.includes(":")) return true; // IPv6
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
};

const isLoopbackHost = (host) => {
  const value = normalizeHost(host);
  return value === "localhost" || value === "::1" || /^127(?:\.\d{1,3}){3}$/.test(value);
};

const domainMatchesHost = (domain, host) => {
  const safeHost = normalizeHost(host);
  const safeDomain = String(domain || "").trim().replace(/^\./, "").toLowerCase();
  if (!safeHost || !safeDomain) return false;
  return safeHost === safeDomain || safeHost.endsWith(`.${safeDomain}`);
};

const rewriteSetCookieForRequest = (cookie, context) => {
  if (!context) return cookie;
  const parts = String(cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) return cookie;

  const nameValue = parts[0];
  const attrs = [];
  let domain = "";
  let sameSite = "";
  let hasSecure = false;

  for (const attr of parts.slice(1)) {
    const [rawKey, ...rest] = attr.split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = rest.join("=").trim();

    if (key === "domain") {
      domain = value;
      continue;
    }
    if (key === "samesite") {
      sameSite = value;
      continue;
    }
    if (key === "secure") {
      hasSecure = true;
      continue;
    }
    attrs.push(attr);
  }

  const host = normalizeHost(context.host);
  const dropDomain =
    domain &&
    (isIpHost(host) || isLoopbackHost(host) || !domainMatchesHost(domain, host));

  if (domain && !dropDomain) {
    attrs.push(`Domain=${domain}`);
  }

  let finalSameSite = sameSite;
  if (!context.isSecure && String(sameSite || "").toLowerCase() === "none") {
    finalSameSite = "Lax";
  }
  if (finalSameSite) {
    attrs.push(`SameSite=${finalSameSite}`);
  }

  if (context.isSecure && hasSecure) {
    attrs.push("Secure");
  }

  return [nameValue, ...attrs].join("; ");
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

const appendSetCookieHeaders = (targetHeaders, upstreamHeaders, context = null) => {
  const getSetCookie = upstreamHeaders?.getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(upstreamHeaders) || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
      if (/^\s*access_token=/i.test(cookie)) continue;
      targetHeaders.append("set-cookie", rewriteSetCookieForRequest(cookie, context));
    }
    return;
  }

  const combinedCookieHeader = String(upstreamHeaders.get("set-cookie") || "").trim();
  if (!combinedCookieHeader) return;

  const splitCookies = combinedCookieHeader
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const cookie of splitCookies) {
    if (/^\s*access_token=/i.test(cookie)) continue;
    targetHeaders.append("set-cookie", rewriteSetCookieForRequest(cookie, context));
  }
};

const readTokenFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
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

const readCsrfFromPayload = (payload = {}, headers = null) => {
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
  const value = payload?.expiresIn ?? payload?.expires_in ?? data?.expiresIn ?? data?.expires_in;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const getSetCookieLines = (headers) => {
  const getSetCookie = headers?.getSetCookie;
  if (typeof getSetCookie === "function") {
    return (getSetCookie.call(headers) || []).filter(Boolean);
  }
  const combined = String(headers?.get("set-cookie") || "").trim();
  if (!combined) return [];
  return combined
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

const readCookieValueFromSetCookie = (headers, keys = []) => {
  const allowed = new Set((keys || []).map((key) => String(key || "").trim()).filter(Boolean));
  if (!allowed.size) return "";
  for (const line of getSetCookieLines(headers)) {
    const firstSemi = line.indexOf(";");
    const firstPart = (firstSemi >= 0 ? line.slice(0, firstSemi) : line).trim();
    const eq = firstPart.indexOf("=");
    if (eq < 0) continue;
    const name = firstPart.slice(0, eq).trim();
    const value = firstPart.slice(eq + 1).trim();
    if (!name || !value) continue;
    if (allowed.has(name)) return value;
  }
  return "";
};

const buildUpstreamCandidates = () =>
  Array.from(new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean)));

const getRefreshCookieFromRequest = (request) => {
  for (const key of REFRESH_COOKIE_KEYS) {
    const fromCookieStore = String(request.cookies?.get(key)?.value || "").trim();
    if (fromCookieStore) return fromCookieStore;
  }

  const cookieHeader = String(request.headers.get("cookie") || "");
  for (const key of REFRESH_COOKIE_KEYS) {
    const fromHeader = getCookieValueFromHeader(cookieHeader, key);
    if (String(fromHeader || "").trim()) return String(fromHeader || "").trim();
  }
  return "";
};

const toCookieHeader = (request, refreshCookieValue) => {
  const incomingCookie = String(request.headers.get("cookie") || "").trim();
  if (incomingCookie) {
    const hasKnownRefreshCookie = REFRESH_COOKIE_KEYS.some((key) =>
      Boolean(getCookieValueFromHeader(incomingCookie, key))
    );
    if (hasKnownRefreshCookie) return incomingCookie;
  }

  if (!refreshCookieValue) return incomingCookie;

  if (!incomingCookie) {
    return `${REFRESH_COOKIE_NAME}=${refreshCookieValue}`;
  }
  return `${incomingCookie}; ${REFRESH_COOKIE_NAME}=${refreshCookieValue}`;
};

const doRefreshRequest = async ({
  upstreamUrl,
  cookieHeader,
  requestBody,
  incomingCsrf,
  includeCsrf = true,
  forwardedHeaders = {},
}) => {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-product-key", PRODUCT_KEY);
  headers.delete("authorization");
  headers.delete("Authorization");
  
  if (forwardedHeaders["user-agent"]) headers.set("user-agent", forwardedHeaders["user-agent"]);
  if (forwardedHeaders["x-forwarded-for"]) headers.set("x-forwarded-for", forwardedHeaders["x-forwarded-for"]);
  if (forwardedHeaders["x-real-ip"]) headers.set("x-real-ip", forwardedHeaders["x-real-ip"]);
  if (forwardedHeaders["origin"]) headers.set("origin", forwardedHeaders["origin"]);
  if (forwardedHeaders["referer"]) headers.set("referer", forwardedHeaders["referer"]);
  
  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (includeCsrf && incomingCsrf) {
    headers.set("x-csrf-token", incomingCsrf);
    headers.set("x-xsrf-token", incomingCsrf);
    headers.set("csrf-token", incomingCsrf);
  }

  const parsed = requestBody && typeof requestBody === "object" ? requestBody : {};
  const body = JSON.stringify({
    ...parsed,
    product_key: PRODUCT_KEY,
  });

  return fetch(upstreamUrl, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
  });
};

export async function POST(request) {
  const cookieContext = getCookieContext(request);
  const upstreamCandidates = buildUpstreamCandidates();
  
  const forwardedHeaders = {
    "user-agent": request.headers.get("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "x-forwarded-for": request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
    "x-real-ip": request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "",
    "origin": request.headers.get("origin") || request.headers.get("Host") || "",
    "referer": request.headers.get("referer") || "",
  };

  if (upstreamCandidates.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_REFRESH_UNAVAILABLE",
          message: "Refresh upstream is not configured",
        },
      },
      { status: 502 }
    );
  }

  const refreshCookieValue = getRefreshCookieFromRequest(request);
  if (!refreshCookieValue) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid refresh session",
        },
      },
      { status: 401 }
    );
  }

  let requestBody = {};
  try {
    const bodyText = await request.text();
    requestBody = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    requestBody = {};
  }

  const cookieHeader = toCookieHeader(request, refreshCookieValue);
  const incomingCsrf = resolveCsrfHeaderValue(
    String(request.headers.get("x-csrf-token") || "").trim(),
    cookieHeader
  );

  let upstreamResponse = null;
  let payloadText = "";
  let payloadJson = {};
  let lastNetworkError = null;

  for (const baseUrl of upstreamCandidates) {
    const upstreamUrl = `${String(baseUrl).replace(/\/+$/, "")}/auth/refresh`;

    try {
      upstreamResponse = await doRefreshRequest({
        upstreamUrl,
        cookieHeader,
        requestBody,
        incomingCsrf,
        includeCsrf: true,
        forwardedHeaders,
      });
    } catch (err) {
      lastNetworkError = err instanceof Error ? err : new Error("Refresh request failed");
      upstreamResponse = null;
      continue;
    }

    if ([401, 403].includes(Number(upstreamResponse.status || 0)) && incomingCsrf) {
      try {
        const noCsrfRetry = await doRefreshRequest({
          upstreamUrl,
          cookieHeader,
          requestBody,
          incomingCsrf,
          includeCsrf: false,
          forwardedHeaders,
        });
        if (noCsrfRetry.ok || ![401, 403].includes(Number(noCsrfRetry.status || 0))) {
          upstreamResponse = noCsrfRetry;
        }
      } catch {
        // Keep original response from the CSRF attempt.
      }
    }

    if (upstreamResponse && Number(upstreamResponse.status || 0) < 500) {
      break;
    }
  }

  if (!upstreamResponse) {
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_REFRESH_UNAVAILABLE",
          message: "Unable to reach auth refresh upstream",
          ...(lastNetworkError ? { details: "network_error" } : {}),
        },
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  const contentType = String(upstreamResponse.headers.get("content-type") || "").trim();
  if (contentType) responseHeaders.set("content-type", contentType);
  appendSetCookieHeaders(responseHeaders, upstreamResponse.headers, cookieContext);

  try {
    payloadText = await upstreamResponse.text();
    payloadJson = payloadText ? JSON.parse(payloadText) : {};
  } catch {
    payloadText = "";
    payloadJson = {};
  }

  if (upstreamResponse.ok) {
    const accessToken = readTokenFromPayload(payloadJson, upstreamResponse.headers);
    const response = NextResponse.json(
      {
        success: true,
        ...(accessToken ? { accessToken, access_token: accessToken } : {}),
        ...(readCsrfFromPayload(payloadJson, upstreamResponse.headers)
          ? { csrfToken: readCsrfFromPayload(payloadJson, upstreamResponse.headers) }
          : {}),
        ...(readExpiresInFromPayload(payloadJson) != null
          ? { expiresIn: readExpiresInFromPayload(payloadJson) }
          : {}),
      },
      {
        status: 200,
        headers: responseHeaders,
      }
    );
    if (accessToken) {
      response.headers.set("authorization", `Bearer ${accessToken}`);
    }
    return response;
  }

  const status = Number(upstreamResponse.status || 0);
  const invalidRefresh = status === 401 || status === 403;
  if (invalidRefresh) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid refresh session",
          _debug: {
            url: upstreamResponse.url,
            status: upstreamResponse.status,
            host: cookieContext.host,
            origin: forwardedHeaders["origin"]
          }
        },
      },
      { status: 401, headers: responseHeaders }
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "REFRESH_FAILED",
        message: "Refresh failed",
      },
    },
    { status: 502, headers: responseHeaders }
  );
}
