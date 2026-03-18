import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";

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

const buildUpstreamCandidates = () => {
  const bases = Array.from(
    new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
  );

  const urls = [];
  for (const base of bases) {
    const normalized = String(base || "").trim().replace(/\/+$/, "");
    if (!normalized) continue;

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

    if (!hasApiV1 && !hasV1) {
      urls.push(`${normalized}/v1/sso`);
    }
    urls.push(`${normalized}/sso`);
    urls.push(`${normalized}/auth/sso`);
    try {
      if (origin) {
        urls.push(`${origin}/api/v1/sso`);
        urls.push(`${origin}/v1/sso`);
        urls.push(`${origin}/sso`);
        urls.push(`${origin}/auth/sso`);
      }
    } catch {
      // keep direct normalized candidates only
    }
  }
  return urls;
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

export async function POST(request) {
  const cookieContext = getCookieContext(request);
  let bodyPayload = {};
  try {
    bodyPayload = await request.json();
  } catch {
    bodyPayload = {};
  }

  console.log("[SSO Mint] Starting bridge token mint", { bodyPayload });

  const cookieHeader = String(request.headers.get("cookie") || "").trim();
  const authorizationHeader = String(
    request.headers.get("authorization") || request.headers.get("Authorization") || ""
  ).trim();
  const upstreamCandidates = buildUpstreamCandidates();
  if (upstreamCandidates.length === 0) {
    console.error("[SSO Mint] No upstream candidates configured", {
      API_REMOTE_BASE_URL,
      API_REMOTE_FALLBACK_BASE_URL,
    });
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_SSO_UNAVAILABLE",
          message: "SSO upstream is not configured",
        },
      },
      { status: 502 }
    );
  }

  console.log("[SSO Mint] Upstream candidates:", upstreamCandidates);

  let lastResponse = null;
  for (const upstreamUrl of upstreamCandidates) {
    console.log(`[SSO Mint] Trying upstream: ${upstreamUrl}`);
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("x-product-key", PRODUCT_KEY);
    if (cookieHeader) headers.set("cookie", cookieHeader);
    if (authorizationHeader) headers.set("authorization", authorizationHeader);

    const body = JSON.stringify({
      ...(bodyPayload && typeof bodyPayload === "object" ? bodyPayload : {}),
      product_key: PRODUCT_KEY,
      target_product_key:
        String(bodyPayload?.target_product_key || "").trim() || PRODUCT_KEY,
    });

    console.log(`[SSO Mint] Request body:`, JSON.parse(body));

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
      });

      lastResponse = upstreamResponse;
      const status = Number(upstreamResponse.status || 0);
      console.log(`[SSO Mint] Upstream response: ${upstreamUrl} -> ${status}`);

      if (status === 404 || status === 405) continue;

      const responseHeaders = new Headers();
      const contentType = String(upstreamResponse.headers.get("content-type") || "").trim();
      if (contentType) responseHeaders.set("content-type", contentType);
      appendSetCookieHeaders(responseHeaders, upstreamResponse.headers, cookieContext);

      const payloadText = await upstreamResponse.text();
      console.log(`[SSO Mint] Response payload:`, payloadText);
      return new NextResponse(payloadText, {
        status,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error(`[SSO Mint] Error trying upstream ${upstreamUrl}:`, error.message);
      // try next candidate
    }
  }

  if (lastResponse) {
    const payloadText = await lastResponse.text();
    return new NextResponse(payloadText, {
      status: Number(lastResponse.status || 502),
    });
  }

  return NextResponse.json(
    {
      error: {
        code: "UPSTREAM_SSO_UNAVAILABLE",
        message: "Unable to reach SSO upstream",
      },
    },
    { status: 502 }
  );
}
