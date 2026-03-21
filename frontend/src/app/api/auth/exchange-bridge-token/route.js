import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getCookieOptions } from "@/lib/auth/cookieOptions";
import { CSRF_COOKIE_KEYS } from "@/lib/auth/cookieKeys";
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

const appendSetCookieHeaders = (targetHeaders, upstreamHeaders, context = null) => {
  const getSetCookie = upstreamHeaders?.getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(upstreamHeaders) || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
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
    targetHeaders.append("set-cookie", rewriteSetCookieForRequest(cookie, context));
  }
};

const getSetCookieList = (headers) => {
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

const readCookieValueFromSetCookieHeaders = (setCookieHeaders = [], candidateNames = []) => {
  const loweredCandidates = candidateNames.map((name) => String(name || "").trim().toLowerCase());
  for (const raw of setCookieHeaders) {
    const firstPair = String(raw || "").split(";")[0] || "";
    const idx = firstPair.indexOf("=");
    if (idx < 0) continue;
    const name = firstPair.slice(0, idx).trim();
    const value = firstPair.slice(idx + 1).trim();
    if (!name || !value) continue;
    if (!loweredCandidates.includes(name.toLowerCase())) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
};

const readTokenFromPayload = (payload = {}) => {
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

const readCsrfFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj = data?.token || payload?.token || {};
  return String(
    payload?.csrf_token_property ||
      data?.csrf_token_property ||
    payload?.csrfToken ||
      payload?.csrf_token ||
      data?.csrfToken ||
      data?.csrf_token ||
      tokenObj?.csrfToken ||
      tokenObj?.csrf_token ||
      headers?.get("x-csrf-token") ||
      headers?.get("csrf-token") ||
      headers?.get("x-xsrf-token") ||
      ""
  ).trim();
};

const parseSetCookieAttributes = (cookieLine = "") => {
  const parts = String(cookieLine || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const attrs = { maxAge: null, expires: null };
  for (const attr of parts.slice(1)) {
    const [rawKey, ...rest] = attr.split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "max-age") {
      const num = Number(value);
      if (Number.isFinite(num)) attrs.maxAge = num;
    } else if (key === "expires") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) attrs.expires = date;
    }
  }
  return attrs;
};

const readCookieAttributesFromSetCookieHeaders = (setCookieHeaders = [], candidateNames = []) => {
  const loweredCandidates = candidateNames.map((name) => String(name || "").trim().toLowerCase());
  for (const raw of setCookieHeaders) {
    const firstPair = String(raw || "").split(";")[0] || "";
    const idx = firstPair.indexOf("=");
    if (idx < 0) continue;
    const name = firstPair.slice(0, idx).trim().toLowerCase();
    if (!loweredCandidates.includes(name)) continue;
    const attrs = parseSetCookieAttributes(raw);
    if (attrs.maxAge != null || attrs.expires) return attrs;
  }
  return { maxAge: null, expires: null };
};

const readJwtExpirySeconds = (token) => {
  try {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) return null;
    const now = Math.floor(Date.now() / 1000);
    const diff = exp - now;
    return diff > 0 ? diff : null;
  } catch {
    return null;
  }
};

const buildExpiryOptions = ({ maxAgeSeconds = null, expiresAt = null } = {}) => {
  const options = {};
  if (Number.isFinite(maxAgeSeconds)) {
    const safe = Math.max(1, Math.floor(maxAgeSeconds));
    options.maxAge = safe;
    return options;
  }
  if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
    options.expires = expiresAt;
  }
  return options;
};

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const cookieContext = getCookieContext(req);

  const baseCandidates = Array.from(
    new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
  ).map((base) => String(base || "").trim().replace(/\/+$/, ""));
  if (baseCandidates.length === 0) {
    console.error("[SSO Exchange] No API base URLs configured", {
      API_REMOTE_BASE_URL,
      API_REMOTE_FALLBACK_BASE_URL,
      env: {
        NEXT_PUBLIC_DEV_URL: process.env.NEXT_PUBLIC_DEV_URL,
        NEXT_PUBLIC_CENTRAL_URL: process.env.NEXT_PUBLIC_CENTRAL_URL,
        NEXT_ENV: process.env.NEXT_ENV,
      },
    });
    return NextResponse.json(
      {
        error: {
          code: "API_BASE_URL_MISSING",
          message: "API base URL is not configured",
        },
      },
      { status: 500 }
    );
  }

  console.log("[SSO Exchange] Starting exchange with base candidates:", baseCandidates);
  console.log("[SSO Exchange] Request body:", body);

  const productKey = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
  const cookieHeader = req.headers.get("cookie") || "";
  const headers = {
    "Content-Type": "application/json",
    cookie: cookieHeader,
    ...(productKey ? { "x-product-key": productKey } : {}),
  };
  const payload = JSON.stringify({
    ...body,
    ...(productKey ? { target_product_key: productKey } : {}),
    ...(productKey ? { product_key: productKey } : {}),
  });

  const buildUpstreamCandidates = (base) => {
    const normalized = String(base || "").trim().replace(/\/+$/, "");
    if (!normalized) return [];

    let hasApiV1 = false;
    let hasV1 = false;
    let origin = "";

    try {
      const parsed = new URL(normalized);
      origin = String(parsed.origin || "").trim().replace(/\/+$/, "");
      const path = String(parsed.pathname || "").replace(/\/+$/, "");
      hasApiV1 = /\/api\/v1$/i.test(path);
      hasV1 = /\/v1$/i.test(path);
    } catch {
      // Non-URL base; fall back to simple candidates.
    }

    const candidates = [
      `${normalized}/sso/exchange`,
      `${normalized}/auth/sso/exchange`,
    ];

    if (!hasApiV1 && !hasV1) {
      candidates.push(`${normalized}/v1/sso/exchange`);
    }

    if (origin) {
      candidates.push(`${origin}/api/v1/sso/exchange`);
      candidates.push(`${origin}/v1/sso/exchange`);
      candidates.push(`${origin}/sso/exchange`);
      candidates.push(`${origin}/auth/sso/exchange`);
    }

    return candidates;
  };

  const upstreamCandidates = Array.from(
    new Set(baseCandidates.flatMap((base) => buildUpstreamCandidates(base)))
  );

  console.log("[SSO Exchange] Upstream candidates:", upstreamCandidates);

  let lastStatus = 502;
  let lastPayload = {
    error: {
      code: "UPSTREAM_SSO_EXCHANGE_UNAVAILABLE",
      message: "Unable to reach SSO exchange upstream",
    },
  };
  let lastHeaders = new Headers();

  for (const url of upstreamCandidates) {
    console.log(`[SSO Exchange] Trying upstream: ${url}`);
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        cache: "no-store",
      });

      const data = await upstream.json().catch(() => ({}));
      const responseHeaders = new Headers();
      appendSetCookieHeaders(responseHeaders, upstream.headers, cookieContext);

      console.log(`[SSO Exchange] Upstream response: ${url} -> ${upstream.status}`, {
        status: upstream.status,
        data,
        hasCookies: responseHeaders.get("set-cookie") ? true : false,
      });

      lastStatus = upstream.status;
      lastPayload = data;
      lastHeaders = responseHeaders;

      const status = Number(upstream.status || 0);
      if (status >= 500) {
        // Treat 5xx as transient for this candidate; try next upstream.
        continue;
      }
      if (upstream.ok || ![404, 405].includes(status)) {
        const cookieOptions = getCookieOptions(req);
        const response = NextResponse.json(data, { status: upstream.status, headers: responseHeaders });
        if (upstream.ok) {
          console.log("[SSO Exchange] Success - relaying upstream cookies");
          // Explicitly set refresh and CSRF cookies with correct SameSite/Secure/Domain
          const setCookies = getSetCookieList(upstream.headers);
          const refreshToken =
            readTokenFromPayload(data) ||
            readCookieValueFromSetCookieHeaders(setCookies, [
              "refresh_token_property", "refresh_token",
              "refreshToken_property", "refreshToken", "property_refresh_token",
            ]);
          const csrfToken =
            readCsrfFromPayload(data, upstream.headers) ||
            readCookieValueFromSetCookieHeaders(setCookies, CSRF_COOKIE_KEYS);
          const refreshCookieAttrs = readCookieAttributesFromSetCookieHeaders(setCookies, [
            "refresh_token_property", "refresh_token",
            "refreshToken_property", "refreshToken", "property_refresh_token",
          ]);
          const csrfCookieAttrs = readCookieAttributesFromSetCookieHeaders(setCookies, CSRF_COOKIE_KEYS);
          const refreshMaxAgeFromJwt = refreshToken ? readJwtExpirySeconds(refreshToken) : null;
          const refreshExpiry = buildExpiryOptions({
            maxAgeSeconds: refreshCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? null,
            expiresAt: refreshCookieAttrs.expires || null,
          });
          const csrfExpiry = buildExpiryOptions({
            maxAgeSeconds: csrfCookieAttrs.maxAge ?? refreshMaxAgeFromJwt ?? null,
            expiresAt: csrfCookieAttrs.expires || null,
          });
          if (refreshToken) {
            response.cookies.set({
              name: "refresh_token_property",
              value: refreshToken,
              httpOnly: true,
              sameSite: cookieOptions.sameSite,
              secure: cookieOptions.secure,
              ...(cookieOptions?.domain ? { domain: cookieOptions.domain } : {}),
              path: "/",
              ...refreshExpiry,
            });
          }
          if (csrfToken) {
            response.cookies.set({
              name: "csrf_token_property",
              value: csrfToken,
              httpOnly: false,
              sameSite: cookieOptions.sameSite,
              secure: cookieOptions.secure,
              ...(cookieOptions?.domain ? { domain: cookieOptions.domain } : {}),
              path: "/",
              ...csrfExpiry,
            });
          }
        }
        return response;
      }
    } catch (error) {
      console.error(`[SSO Exchange] Error trying upstream ${url}:`, error.message);
      // try next candidate
    }
  }

  console.error("[SSO Exchange] All upstream candidates failed", {
    lastStatus,
    lastPayload,
    triedUrls: upstreamCandidates,
    baseCandidates,
    env: {
      API_REMOTE_BASE_URL,
      API_REMOTE_FALLBACK_BASE_URL,
    },
  });

  return NextResponse.json(lastPayload, { status: lastStatus, headers: lastHeaders });
}
