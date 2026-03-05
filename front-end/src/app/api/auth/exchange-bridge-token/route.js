import { NextResponse } from "next/server";

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

const readAccessTokenFromPayload = (payload = {}, headers = null) => {
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

const setAuthCookiesByPayload = (response, payload = {}, upstreamHeaders = null) => {
  const accessToken = readAccessTokenFromPayload(payload, upstreamHeaders);
  const refreshToken = readRefreshTokenFromPayload(payload);
  const csrfToken = readCsrfFromPayload(payload, upstreamHeaders);
  const expiresIn = readExpiresInFromPayload(payload);

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
      name: "refresh_token_property",
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

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const apiBaseUrl = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!apiBaseUrl) {
    return NextResponse.json(
      {
        error: {
          code: "API_BASE_URL_MISSING",
          message: "NEXT_PUBLIC_API_BASE_URL is not configured",
        },
      },
      { status: 500 }
    );
  }

  const productKey = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim();
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

  const upstreamCandidates = [
    `${apiBaseUrl}/v1/sso/exchange`,
    `${apiBaseUrl}/sso/exchange`,
    `${apiBaseUrl}/auth/sso/exchange`,
  ];

  let lastStatus = 502;
  let lastPayload = {
    error: {
      code: "UPSTREAM_SSO_EXCHANGE_UNAVAILABLE",
      message: "Unable to reach SSO exchange upstream",
    },
  };
  let lastHeaders = new Headers();

  for (const url of upstreamCandidates) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        cache: "no-store",
      });

      const data = await upstream.json().catch(() => ({}));
      const responseHeaders = new Headers();
      appendSetCookieHeaders(responseHeaders, upstream.headers);

      lastStatus = upstream.status;
      lastPayload = data;
      lastHeaders = responseHeaders;

      if (upstream.ok || ![404, 405].includes(Number(upstream.status || 0))) {
        const response = NextResponse.json(data, { status: upstream.status, headers: responseHeaders });
        if (upstream.ok) {
          setAuthCookiesByPayload(response, data, upstream.headers);
        }
        return response;
      }
    } catch {
      // try next candidate
    }
  }

  return NextResponse.json(lastPayload, { status: lastStatus, headers: lastHeaders });
}
