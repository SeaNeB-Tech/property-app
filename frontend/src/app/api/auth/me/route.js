import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim() || "property";
const CSRF_COOKIE_KEYS = ["csrf_token_property", "csrf_token"];

const getBaseCandidates = () =>
  Array.from(new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean)));

const shouldUseSecureCookies = (request) => {
  const forwardedProto = String(request?.headers?.get?.("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) return forwardedProto === "https";

  const protocol = String(request?.nextUrl?.protocol || "").trim().toLowerCase();
  if (protocol) return protocol === "https:";

  return process.env.NODE_ENV === "production";
};

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

const getFirstCookieValueFromHeader = (cookieHeader, keys = []) => {
  for (const key of keys) {
    const value = getCookieValueFromHeader(cookieHeader, key);
    if (String(value || "").trim()) return String(value || "").trim();
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

const readAccessTokenFromPayload = (payload = {}, headers = null) => {
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

const setAuthCookiesByPayload = (response, payload = {}, headers = null, secure = false) => {
  const accessToken = readAccessTokenFromPayload(payload, headers);
  const refreshToken = readRefreshTokenFromPayload(payload);
  const csrfToken = readCsrfFromPayload(payload, headers);
  const expiresIn = readExpiresInFromPayload(payload);

  if (refreshToken) {
    response.cookies.set({
      name: "refresh_token_property",
      value: refreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    });
  }
  if (csrfToken) {
    response.cookies.set({
      name: "csrf_token_property",
      value: csrfToken,
      httpOnly: false,
      sameSite: "lax",
      secure,
      path: "/",
    });
  }
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
  accessToken,
}) => {
  const normalizedBase = String(base).replace(/\/+$/, "");
  const url = `${normalizedBase}${path}`;
  const headers = new Headers();
  headers.set("x-product-key", PRODUCT_KEY);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (csrfHeader) headers.set("x-csrf-token", csrfHeader);
  if (authorizationHeader) {
    headers.set("authorization", authorizationHeader);
  } else if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
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

  const incomingCookie = stripCookieKeysFromHeader(
    String(request.headers.get("cookie") || "").trim(),
    ["access_token", "accessToken", "token"]
  );
  const incomingCsrf = String(request.headers.get("x-csrf-token") || "").trim();
  const incomingAuthorization = String(
    request.headers.get("authorization") || request.headers.get("Authorization") || ""
  ).trim();
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
          accessToken: "",
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
            const refreshPayload = await refreshResponse.clone().json().catch(() => ({}));

            const refreshedCookieJar = new Map(initialCookieJar);
            applySetCookiesToJar(refreshedCookieJar, refreshResponse.headers);
            const accessFromPayload = readAccessTokenFromPayload(refreshPayload, refreshResponse.headers);
            const refreshFromPayload = readRefreshTokenFromPayload(refreshPayload);
            const csrfFromPayload = readCsrfFromPayload(refreshPayload, refreshResponse.headers);
            if (refreshFromPayload) refreshedCookieJar.set("refresh_token_property", refreshFromPayload);
            if (csrfFromPayload) refreshedCookieJar.set("csrf_token_property", csrfFromPayload);
            const mergedCookieHeader = toCookieHeader(refreshedCookieJar);
            const csrfAfterRefresh =
              getFirstCookieValueFromHeader(mergedCookieHeader, CSRF_COOKIE_KEYS) || incomingCsrf;

            const retryProfile = await requestProfile({
              base,
              path,
              cookieHeader: mergedCookieHeader,
              csrfHeader: csrfAfterRefresh,
              authorizationHeader: incomingAuthorization,
              accessToken: accessFromPayload,
            });

            const response = await copyResponse(retryProfile, responseHeaders);
            setAuthCookiesByPayload(
              response,
              refreshPayload,
              refreshResponse.headers,
              shouldUseSecureCookies(request)
            );
            response.cookies.delete("access_token");
            return response;
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
