import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";

const buildUpstreamCandidates = () =>
  Array.from(new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))).map(
    (base) => String(base).replace(/\/+$/, "")
  );

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

const proxyJsonPost = async ({ request, upstreamPathCandidates = [] } = {}) => {
  const bases = buildUpstreamCandidates();
  if (bases.length === 0) {
    return NextResponse.json(
      { error: { code: "UPSTREAM_UNAVAILABLE", message: "API base URL is not configured" } },
      { status: 502 }
    );
  }

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    bodyText = "";
  }

  const incomingCookie = stripCookieKeysFromHeader(
    String(request.headers.get("cookie") || "").trim(),
    ["access_token", "accessToken", "token"]
  );
  const incomingCsrf = String(request.headers.get("x-csrf-token") || "").trim();

  let lastResponse = null;
  let resolvedResponse = null;
  let lastNetworkError = null;

  for (const base of bases) {
    let resolvedForBase = false;
    for (const path of upstreamPathCandidates) {
      const cleanPath = String(path || "").replace(/^\/+/, "");
      const url = `${base}/${cleanPath}`;
      const headers = new Headers();
      headers.set("content-type", "application/json");
      headers.set("x-product-key", PRODUCT_KEY);
      if (incomingCookie) headers.set("cookie", incomingCookie);
      if (incomingCsrf) headers.set("x-csrf-token", incomingCsrf);

      try {
        const upstreamResponse = await fetch(url, {
          method: "POST",
          headers,
          body: bodyText || "{}",
          cache: "no-store",
          redirect: "manual",
        });
        lastResponse = upstreamResponse;

        const status = Number(upstreamResponse.status || 0);
        if (upstreamResponse.ok) {
          resolvedResponse = upstreamResponse;
          resolvedForBase = true;
          break;
        }

        if (status === 404 || status === 405) {
          // Try the next upstream path candidate on the same base.
          continue;
        }

        if (status >= 500) {
          // Base is unhealthy (dev down, etc). Try the next base URL.
          break;
        }

        // Valid non-5xx response (400/401/403/422/etc). Return it to the client.
        resolvedResponse = upstreamResponse;
        resolvedForBase = true;
        break;
      } catch (err) {
        lastNetworkError = err instanceof Error ? err : new Error("network_error");
        lastResponse = null;
      }
    }
    if (resolvedForBase) break;
  }

  const responseToReturn = resolvedResponse || lastResponse;

  if (!responseToReturn) {
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Unable to reach upstream",
          ...(lastNetworkError ? { details: "network_error" } : {}),
        },
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  const cookieContext = getCookieContext(request);
  const contentType = String(responseToReturn.headers.get("content-type") || "").trim();
  if (contentType) responseHeaders.set("content-type", contentType);
  appendSetCookieHeaders(responseHeaders, responseToReturn.headers, cookieContext);

  let payloadText = "";
  let payloadJson = null;
  try {
    payloadText = await responseToReturn.text();
    payloadJson = payloadText ? JSON.parse(payloadText) : null;
  } catch {
    payloadText = "";
    payloadJson = null;
  }

  const responseBody = payloadJson ?? (payloadText ? { raw: payloadText } : {});
  const res = NextResponse.json(responseBody, { status: responseToReturn.status, headers: responseHeaders });

  return res;
};

export const proxyOtpSend = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      // Public OTP endpoints must be tried before auth-only variants.
      "/otp/send-otp",
      "/v1/otp/send-otp",
      "/auth/send-otp",
      "/auth/otp/send",
      "/auth/otp/send-otp",
      "/auth/sendotp",
      "/v1/auth/send-otp",
    ],
  });
};

export const proxyOtpVerify = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      "/otp/verify-otp",
      "/v1/otp/verify-otp",
      "/auth/verify-otp",
      "/auth/otp/verify",
      "/auth/otp/verify-otp",
      "/v1/auth/verify-otp",
    ],
  });
};

// Legacy/simple endpoints used by existing rewrites: /api/auth/send-otp and /api/auth/verify-otp
// These proxy to upstream; cookies are handled by the backend and passed through as-is.
export const proxySendOtpLegacy = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      "/otp/send-otp",
      "/v1/otp/send-otp",
      "/auth/send-otp",
      "/auth/otp/send-otp",
      "/auth/otp/send",
      "/auth/sendotp",
      "/v1/auth/send-otp",
    ],
  });
};

export const proxyVerifyOtpLegacy = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      "/otp/verify-otp",
      "/v1/otp/verify-otp",
      "/auth/verify-otp",
      "/auth/otp/verify-otp",
      "/auth/otp/verify",
      "/v1/auth/verify-otp",
    ],
  });
};

