import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";

const getBaseCandidates = () =>
  Array.from(new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean)));

const getPathCandidates = () => ["/auth/me", "/profile/me"];

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

const copyResponse = async (upstreamResponse) => {
  const headers = new Headers(upstreamResponse.headers);
  headers.delete("content-length");
  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};

export async function GET(request) {
  const bases = getBaseCandidates();
  if (bases.length === 0) {
    return NextResponse.json(
      { error: { code: "UPSTREAM_PROFILE_UNAVAILABLE", message: "API base URL is not configured" } },
      { status: 502 }
    );
  }

  const incomingCookie = String(request.headers.get("cookie") || "").trim();
  const incomingCsrf = String(request.headers.get("x-csrf-token") || "").trim();
  const incomingAuthorization = String(
    request.headers.get("authorization") || request.headers.get("Authorization") || ""
  ).trim();
  const accessTokenFromCookie = getCookieValueFromHeader(incomingCookie, "access_token");

  let lastResponse = null;
  for (const base of bases) {
    const normalizedBase = String(base).replace(/\/+$/, "");
    for (const path of getPathCandidates()) {
      const url = `${normalizedBase}${path}`;
      const headers = new Headers();
      headers.set("x-product-key", PRODUCT_KEY);
      if (incomingCookie) headers.set("cookie", incomingCookie);
      if (incomingCsrf) headers.set("x-csrf-token", incomingCsrf);
      if (incomingAuthorization) {
        headers.set("authorization", incomingAuthorization);
      } else if (accessTokenFromCookie) {
        headers.set("authorization", `Bearer ${accessTokenFromCookie}`);
      }

      try {
        const response = await fetch(url, {
          method: "GET",
          headers,
          cache: "no-store",
          redirect: "manual",
        });
        lastResponse = response;
        if (response.ok) return copyResponse(response);
        const status = Number(response.status || 0);
        if (![404, 405, 500, 502, 503, 504].includes(status)) {
          return copyResponse(response);
        }
      } catch {
        // Try next candidate.
      }
    }
  }

  if (lastResponse) return copyResponse(lastResponse);
  return NextResponse.json(
    { error: { code: "UPSTREAM_PROFILE_UNAVAILABLE", message: "Unable to reach profile upstream" } },
    { status: 502 }
  );
}
