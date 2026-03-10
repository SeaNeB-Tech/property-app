import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";

const buildUpstreamCandidates = () => {
  const bases = Array.from(
    new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
  );

  const urls = [];
  for (const base of bases) {
    const normalized = String(base).replace(/\/+$/, "");
    if (!normalized) continue;
    urls.push(`${normalized}/v1/sso`);
    urls.push(`${normalized}/sso`);
    urls.push(`${normalized}/auth/sso`);
    try {
      const parsed = new URL(normalized);
      const origin = String(parsed.origin || "").trim().replace(/\/+$/, "");
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

export async function POST(request) {
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
      appendSetCookieHeaders(responseHeaders, upstreamResponse.headers);

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
