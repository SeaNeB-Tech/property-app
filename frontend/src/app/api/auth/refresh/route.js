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

const appendSetCookieHeaders = (targetHeaders, upstreamHeaders) => {
  const getSetCookie = upstreamHeaders?.getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(upstreamHeaders) || [];
    for (const cookie of cookies) {
      if (!cookie) continue;
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
    targetHeaders.append("set-cookie", cookie);
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

const setCookieByPayload = (response, payloadJson = {}, upstreamHeaders = null) => {
  const expiresIn = readExpiresInFromPayload(payloadJson);
  const accessToken = readTokenFromPayload(payloadJson, upstreamHeaders);
  const refreshToken = readRefreshTokenFromPayload(payloadJson);
  const csrfToken = readCsrfFromPayload(payloadJson, upstreamHeaders);

  if (accessToken) {
    response.cookies.set({
      name: "access_token",
      value: accessToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(expiresIn != null ? { maxAge: Math.max(1, Math.floor(expiresIn)) } : {}),
    });
  }

  if (refreshToken) {
    response.cookies.set({
      name: REFRESH_COOKIE_NAME,
      value: refreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  if (csrfToken) {
    response.cookies.set({
      name: "csrf_token_property",
      value: csrfToken,
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
};

const doRefreshRequest = async ({
  upstreamUrl,
  cookieHeader,
  requestBody,
  incomingCsrf,
  includeCsrf = true,
}) => {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-product-key", PRODUCT_KEY);
  headers.delete("authorization");
  headers.delete("Authorization");
  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (includeCsrf && incomingCsrf) headers.set("x-csrf-token", incomingCsrf);

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
  const upstreamCandidates = buildUpstreamCandidates();
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
  appendSetCookieHeaders(responseHeaders, upstreamResponse.headers);

  try {
    payloadText = await upstreamResponse.text();
    payloadJson = payloadText ? JSON.parse(payloadText) : {};
  } catch {
    payloadText = "";
    payloadJson = {};
  }

  if (upstreamResponse.ok) {
    const response = NextResponse.json(
      {
        success: true,
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
    setCookieByPayload(response, payloadJson, upstreamResponse.headers);
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
