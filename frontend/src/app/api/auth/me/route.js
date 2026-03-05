import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";

const getBaseCandidates = () =>
  Array.from(new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean)));

const getPathCandidates = () => ["/auth/me", "/profile/me"];
const REFRESH_PATH_CANDIDATES = ["/auth/refresh"];

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

const parseCookieHeader = (cookieHeader) => {
  const jar = new Map();
  const source = String(cookieHeader || "").trim();
  if (!source) return jar;

  const parts = source.split(";");
  for (const part of parts) {
    const item = String(part || "").trim();
    if (!item) continue;
    const idx = item.indexOf("=");
    if (idx < 0) continue;
    const name = item.slice(0, idx).trim();
    const value = item.slice(idx + 1).trim();
    if (!name) continue;
    jar.set(name, value);
  }

  return jar;
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

const applySetCookiesToJar = (jar, upstreamHeaders) => {
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
    jar.set(name, value);
  }
};

const toCookieHeader = (jar) => {
  const pairs = [];
  for (const [name, value] of jar.entries()) {
    pairs.push(`${name}=${value}`);
  }
  return pairs.join("; ");
};

const copyResponse = async (upstreamResponse, extraHeaders = null) => {
  const headers = new Headers(upstreamResponse.headers);
  headers.delete("content-length");
  if (extraHeaders instanceof Headers) {
    const setCookies = extraHeaders.get("set-cookie");
    if (setCookies) {
      appendSetCookieHeaders(headers, extraHeaders);
    }
  }
  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};

const requestProfile = async ({
  base,
  path,
  cookieHeader,
  csrfHeader,
  authorizationHeader,
  accessTokenFromCookie,
}) => {
  const normalizedBase = String(base).replace(/\/+$/, "");
  const url = `${normalizedBase}${path}`;
  const headers = new Headers();
  headers.set("x-product-key", PRODUCT_KEY);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (csrfHeader) headers.set("x-csrf-token", csrfHeader);
  if (authorizationHeader) {
    headers.set("authorization", authorizationHeader);
  } else if (accessTokenFromCookie) {
    headers.set("authorization", `Bearer ${accessTokenFromCookie}`);
  }

  return fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: "manual",
  });
};

const requestRefresh = async ({ base, cookieHeader, csrfHeader, includeCsrf = true }) => {
  const normalizedBase = String(base).replace(/\/+$/, "");

  for (const path of REFRESH_PATH_CANDIDATES) {
    const url = `${normalizedBase}${path}`;
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("x-product-key", PRODUCT_KEY);
    if (cookieHeader) headers.set("cookie", cookieHeader);
    if (includeCsrf && csrfHeader) headers.set("x-csrf-token", csrfHeader);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        cache: "no-store",
        redirect: "manual",
        body: JSON.stringify({ product_key: PRODUCT_KEY }),
      });

      const status = Number(response.status || 0);
      if (status !== 404 && status !== 405) return response;
    } catch {
      // Try next refresh path or base candidate.
    }
  }

  return null;
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
  const initialCookieJar = parseCookieHeader(incomingCookie);

  let lastResponse = null;
  for (const base of bases) {
    for (const path of getPathCandidates()) {
      try {
        const response = await requestProfile({
          base,
          path,
          cookieHeader: incomingCookie,
          csrfHeader: incomingCsrf,
          authorizationHeader: incomingAuthorization,
          accessTokenFromCookie,
        });

        lastResponse = response;
        if (response.ok) return copyResponse(response);

        const status = Number(response.status || 0);
        const shouldTryRefresh = status === 401 || status === 403;
        if (shouldTryRefresh) {
          const refreshResponse =
            (await requestRefresh({
              base,
              cookieHeader: incomingCookie,
              csrfHeader: incomingCsrf,
              includeCsrf: true,
            })) ||
            (incomingCsrf
              ? await requestRefresh({
                  base,
                  cookieHeader: incomingCookie,
                  csrfHeader: incomingCsrf,
                  includeCsrf: false,
                })
              : null);

          if (refreshResponse?.ok) {
            const responseHeaders = new Headers();
            appendSetCookieHeaders(responseHeaders, refreshResponse.headers);

            const refreshedCookieJar = new Map(initialCookieJar);
            applySetCookiesToJar(refreshedCookieJar, refreshResponse.headers);
            const mergedCookieHeader = toCookieHeader(refreshedCookieJar);
            const csrfAfterRefresh =
              getCookieValueFromHeader(mergedCookieHeader, "csrf_token_property") || incomingCsrf;
            const accessAfterRefresh =
              getCookieValueFromHeader(mergedCookieHeader, "access_token") || accessTokenFromCookie;

            const retryProfile = await requestProfile({
              base,
              path,
              cookieHeader: mergedCookieHeader,
              csrfHeader: csrfAfterRefresh,
              authorizationHeader: incomingAuthorization,
              accessTokenFromCookie: accessAfterRefresh,
            });

            return copyResponse(retryProfile, responseHeaders);
          }
        }

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
