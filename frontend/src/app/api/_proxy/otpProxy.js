import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getCookieOptions } from "@/lib/auth/cookieOptions";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";
const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
];
const CSRF_COOKIE_KEYS = ["csrf_token_property", "csrf_token", "x-csrf-token", "x-xsrf-token"];

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

const getFirstCookieValueFromHeader = (cookieHeader, keys = []) => {
  for (const key of keys) {
    const value = String(getCookieValueFromHeader(cookieHeader, key) || "").trim();
    if (value) return value;
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

const appendSetCookieHeaders = (targetHeaders, upstreamHeaders) => {
  const getSetCookie = upstreamHeaders?.getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(upstreamHeaders) || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
      if (/^\s*access_token=/i.test(cookie)) continue;
      targetHeaders.append("set-cookie", cookie);
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
    targetHeaders.append("set-cookie", cookie);
  }
};

const readTokenFromPayload = (payload = {}, headers = null) => {
  const data = payload?.data || {};
  const tokenObj =
    data?.token ||
    payload?.token ||
    payload?.session?.token ||
    payload?.data?.session?.token ||
    payload?.result?.token ||
    payload?.payload?.token ||
    {};
  const headerAuth = String(
    headers?.get("authorization") || headers?.get("Authorization") || ""
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
  const tokenObj =
    data?.token ||
    payload?.token ||
    payload?.session?.token ||
    payload?.data?.session?.token ||
    payload?.result?.token ||
    payload?.payload?.token ||
    {};
  return String(
    payload?.refreshToken ||
      payload?.refresh_token ||
      payload?.session?.refreshToken ||
      payload?.session?.refresh_token ||
      payload?.data?.session?.refreshToken ||
      payload?.data?.session?.refresh_token ||
      data?.refreshToken ||
      data?.refresh_token ||
      tokenObj?.refreshToken ||
      tokenObj?.refresh_token ||
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

const parseSetCookieValue = (setCookieLine) => {
  const line = String(setCookieLine || "").trim();
  if (!line) return { name: "", value: "" };
  const firstSemi = line.indexOf(";");
  const firstPart = (firstSemi >= 0 ? line.slice(0, firstSemi) : line).trim();
  const eq = firstPart.indexOf("=");
  if (eq < 0) return { name: "", value: "" };
  return {
    name: firstPart.slice(0, eq).trim(),
    value: firstPart.slice(eq + 1).trim(),
  };
};

const extractCookieValuesFromUpstream = (upstreamHeaders) => {
  const values = {};
  const setCookies =
    typeof upstreamHeaders?.getSetCookie === "function"
      ? upstreamHeaders.getSetCookie()
      : String(upstreamHeaders?.get("set-cookie") || "")
          .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
          .map((item) => item.trim())
          .filter(Boolean);

  for (const line of setCookies || []) {
    const { name, value } = parseSetCookieValue(line);
    if (!name) continue;
    values[name] = value;
  }

  return values;
};

const setAuthCookies = (
  response,
  { refreshToken, csrfToken, cookieOptions = { sameSite: "Lax", secure: false } } = {}
) => {
  const domain = cookieOptions?.domain || "";
  if (refreshToken) {
    response.cookies.set({
      name: "refresh_token_property",
      value: refreshToken,
      httpOnly: true,
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
      ...(domain ? { domain } : {}),
      path: "/",
    });
  }
  if (csrfToken) {
    const csrfMaxAge = Number(process.env.NEXT_PUBLIC_CSRF_MAX_AGE || 60 * 60 * 24 * 30);
    response.cookies.set({
      name: "csrf_token_property",
      value: csrfToken,
      httpOnly: false,
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
      ...(domain ? { domain } : {}),
      path: "/",
      maxAge: csrfMaxAge,
    });
  }
};

const proxyJsonPost = async ({ request, upstreamPathCandidates = [], setCookiesFromUpstream = false } = {}) => {
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
  const contentType = String(responseToReturn.headers.get("content-type") || "").trim();
  if (contentType) responseHeaders.set("content-type", contentType);
  appendSetCookieHeaders(responseHeaders, responseToReturn.headers);

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

  if (setCookiesFromUpstream) {
    const cookieOptions = getCookieOptions(request);
    const upstreamCookieValues = extractCookieValuesFromUpstream(responseToReturn.headers);
    
    // First try to get tokens from response body
    let refreshToken = readRefreshTokenFromPayload(payloadJson || {});
    let csrfToken = readCsrfFromPayload(payloadJson || {}, responseToReturn.headers);
    
    // If not in body, try to get from upstream cookies
    if (!refreshToken) {
      refreshToken = getFirstCookieValueFromHeader(
        Object.entries(upstreamCookieValues)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
        REFRESH_COOKIE_KEYS
      ) || "";
    }
    
    if (!csrfToken) {
      csrfToken = getFirstCookieValueFromHeader(
        Object.entries(upstreamCookieValues)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
        CSRF_COOKIE_KEYS
      ) || "";
    }
    
    // Always set cookies if we have tokens
    if (refreshToken || csrfToken) {
      setAuthCookies(res, {
        refreshToken,
        csrfToken,
        cookieOptions,
      });
    }
  }

  res.cookies.delete("access_token");

  return res;
};

export const proxyOtpSend = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      "/auth/send-otp",
      "/auth/otp/send",
      "/auth/otp/send-otp",
      "/otp/send-otp",
      "/auth/sendotp",
    ],
    setCookiesFromUpstream: false,
  });
};

export const proxyOtpVerify = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      "/auth/verify-otp",
      "/auth/otp/verify",
      "/auth/otp/verify-otp",
      "/otp/verify-otp",
    ],
    setCookiesFromUpstream: true,
  });
};

// Legacy/simple endpoints used by existing rewrites: /api/auth/send-otp and /api/auth/verify-otp
// We expose these so the browser can hit same-origin endpoints that mint cookies in local development.
export const proxySendOtpLegacy = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      "/auth/send-otp",
      "/otp/send-otp",
      "/auth/otp/send-otp",
      "/auth/otp/send",
      "/auth/sendotp",
    ],
    setCookiesFromUpstream: false,
  });
};

export const proxyVerifyOtpLegacy = async (request) => {
  return proxyJsonPost({
    request,
    upstreamPathCandidates: [
      "/auth/verify-otp",
      "/otp/verify-otp",
      "/auth/otp/verify-otp",
      "/auth/otp/verify",
    ],
    setCookiesFromUpstream: true,
  });
};

