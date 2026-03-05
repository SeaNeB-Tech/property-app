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
    urls.push(`${normalized}/v1/sso`);
    urls.push(`${normalized}/sso`);
    urls.push(`${normalized}/auth/sso`);
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

  const cookieHeader = String(request.headers.get("cookie") || "").trim();
  const upstreamCandidates = buildUpstreamCandidates();
  if (upstreamCandidates.length === 0) {
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

  let lastResponse = null;
  for (const upstreamUrl of upstreamCandidates) {
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("x-product-key", PRODUCT_KEY);
    if (cookieHeader) headers.set("cookie", cookieHeader);

    const body = JSON.stringify({
      ...(bodyPayload && typeof bodyPayload === "object" ? bodyPayload : {}),
      product_key: PRODUCT_KEY,
      target_product_key:
        String(bodyPayload?.target_product_key || "").trim() || PRODUCT_KEY,
    });

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
      if (status === 404 || status === 405) continue;

      const responseHeaders = new Headers();
      const contentType = String(upstreamResponse.headers.get("content-type") || "").trim();
      if (contentType) responseHeaders.set("content-type", contentType);
      appendSetCookieHeaders(responseHeaders, upstreamResponse.headers);

      const payloadText = await upstreamResponse.text();
      return new NextResponse(payloadText, {
        status,
        headers: responseHeaders,
      });
    } catch {
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
