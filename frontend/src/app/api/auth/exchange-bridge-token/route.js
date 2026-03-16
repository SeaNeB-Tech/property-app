import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getCookieOptions } from "@/lib/auth/cookieOptions";
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

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const baseCandidates = Array.from(
    new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
  ).map((base) => String(base || "").trim().replace(/\/+$/, ""));
  if (baseCandidates.length === 0) {
    console.error("[SSO Exchange] No API base URLs configured", {
      API_REMOTE_BASE_URL,
      API_REMOTE_FALLBACK_BASE_URL,
      env: {
        BACKEND_API_URL: process.env.BACKEND_API_URL,
        NEXT_PUBLIC_BACKEND_API_URL: process.env.NEXT_PUBLIC_BACKEND_API_URL,
        NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
        NEXT_PUBLIC_DEV_URL: process.env.NEXT_PUBLIC_DEV_URL,
        NEXT_PUBLIC_CENTRAL_URL: process.env.NEXT_PUBLIC_CENTRAL_URL,
        NEXT_PUBLIC_CENTRAL_API_URL: process.env.NEXT_PUBLIC_CENTRAL_API_URL,
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

  const upstreamCandidates = Array.from(
    new Set(
      baseCandidates.flatMap((base) => {
        const normalized = String(base || "").trim().replace(/\/+$/, "");
        const candidates = [
          `${normalized}/sso/exchange`,
          `${normalized}/auth/sso/exchange`,
          `${normalized}/v1/sso/exchange`,
        ];
        try {
          const parsed = new URL(normalized);
          const origin = String(parsed.origin || "").trim().replace(/\/+$/, "");
          if (origin) {
            candidates.push(`${origin}/api/v1/sso/exchange`);
            candidates.push(`${origin}/v1/sso/exchange`);
            candidates.push(`${origin}/sso/exchange`);
            candidates.push(`${origin}/auth/sso/exchange`);
          }
        } catch {
          // keep normalized candidates only
        }
        return candidates;
      })
    )
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
      appendSetCookieHeaders(responseHeaders, upstream.headers);

      console.log(`[SSO Exchange] Upstream response: ${url} -> ${upstream.status}`, {
        status: upstream.status,
        data,
        hasCookies: responseHeaders.get("set-cookie") ? true : false,
      });

      lastStatus = upstream.status;
      lastPayload = data;
      lastHeaders = responseHeaders;

      if (upstream.ok || ![404, 405].includes(Number(upstream.status || 0))) {
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
            readCookieValueFromSetCookieHeaders(setCookies, [
              "csrf_token_property", "csrf_token", "csrfToken",
            ]);
          if (refreshToken) {
            response.cookies.set({
              name: "refresh_token_property",
              value: refreshToken,
              httpOnly: true,
              sameSite: cookieOptions.sameSite,
              secure: cookieOptions.secure,
              ...(cookieOptions?.domain ? { domain: cookieOptions.domain } : {}),
              path: "/",
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
            });
          }
          response.cookies.delete("access_token");
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
