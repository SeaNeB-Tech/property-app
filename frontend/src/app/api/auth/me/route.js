import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";
import { CSRF_COOKIE_KEYS } from "@/lib/auth/cookieKeys";
import {
  BRANCH_PAYMENT_BRANCH_ID_COOKIE,
  BRANCH_PAYMENT_ORDER_ID_COOKIE,
  BRANCH_PAYMENT_SESSION_ID_COOKIE,
  BRANCH_PAYMENT_STATUS_ACTIVE,
  BRANCH_PAYMENT_STATUS_FAILED,
  BRANCH_PAYMENT_STATUS_COOKIE,
  normalizeBranchPaymentStatus,
  shouldBlockBranchAccess,
} from "@/lib/payment/branchPaymentState";
import { appendPaymentFlowLog, getTrackedBranchPaymentState } from "@/lib/server/paymentFlowLogger";
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

const readJsonSafely = async (response) => {
  if (!response) return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const readBearerToken = (value) => {
  const source = String(value || "").trim();
  if (!source) return "";
  if (/^Bearer\s+/i.test(source)) {
    return source.replace(/^Bearer\s+/i, "").trim();
  }
  return source;
};

const readAccessTokenFromRefresh = async (response) => {
  const fromHeader = readBearerToken(
    response?.headers?.get("authorization") || response?.headers?.get("Authorization") || ""
  );
  if (fromHeader) return fromHeader;

  const payload = await readJsonSafely(response);
  return String(
    payload?.accessToken ||
      payload?.access_token ||
      payload?.data?.accessToken ||
      payload?.data?.access_token ||
      payload?.token ||
      payload?.jwt ||
      ""
  ).trim();
};

const readCsrfTokenFromRefresh = async (response) => {
  const fromHeader = String(
    response?.headers?.get("x-csrf-token") ||
      response?.headers?.get("x-xsrf-token") ||
      response?.headers?.get("csrf-token") ||
      ""
  ).trim();
  if (fromHeader) return fromHeader;

  const payload = await readJsonSafely(response);
  return String(
    payload?.csrfToken ||
      payload?.csrf_token ||
      payload?.data?.csrfToken ||
      payload?.data?.csrf_token ||
      ""
  ).trim();
};

const readText = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const readProfileRecord = (payload = null) => {
  const profile =
    payload?.data?.profile ||
    payload?.data?.user ||
    payload?.data ||
    payload?.profile ||
    payload?.user ||
    payload;

  return profile && typeof profile === "object" ? profile : {};
};

const readProfileBranchId = (payload = null) => {
  const profile = readProfileRecord(payload);
  return readText(
    profile?.branch_id,
    profile?.branchId,
    profile?.current_branch_id,
    profile?.currentBranchId,
    profile?.default_branch_id,
    profile?.defaultBranchId,
    profile?.branch?.branch_id,
    profile?.branch?.branchId,
    profile?.current_branch?.branch_id,
    profile?.current_branch?.branchId,
    profile?.currentBranch?.branch_id,
    profile?.currentBranch?.branchId,
    profile?.default_branch?.branch_id,
    profile?.default_branch?.branchId,
    profile?.defaultBranch?.branch_id,
    profile?.defaultBranch?.branchId,
    profile?.business?.branch_id,
    profile?.business?.branchId,
    profile?.business?.default_branch_id,
    profile?.business?.defaultBranchId
  );
};

const readProfileBusinessId = (payload = null) => {
  const profile = readProfileRecord(payload);
  return readText(
    profile?.business_id,
    profile?.businessId,
    profile?.current_business_id,
    profile?.currentBusinessId,
    profile?.business?.business_id,
    profile?.business?.businessId,
    profile?.business?.id
  );
};

const readProfileBranchStatus = (payload = null) => {
  const profile = readProfileRecord(payload);
  return normalizeBranchPaymentStatus(
    readText(
      profile?.branch_status,
      profile?.branchStatus,
      profile?.current_branch_status,
      profile?.currentBranchStatus,
      profile?.default_branch_status,
      profile?.defaultBranchStatus,
      profile?.branch?.status,
      profile?.current_branch?.status,
      profile?.currentBranch?.status,
      profile?.default_branch?.status,
      profile?.defaultBranch?.status,
      profile?.business?.branch_status,
      profile?.business?.branchStatus
    )
  );
};

const isPanelAccessRestrictedPayload = (payload = null) => {
  const code = String(payload?.error?.code || payload?.code || "").trim().toLowerCase();
  const message = String(payload?.error?.message || payload?.message || "").trim().toLowerCase();

  return (
    /no active branch associated/i.test(message) ||
    message.includes("branch") ||
    message.includes("business") ||
    code.includes("access_denied") ||
    code.includes("forbidden")
  );
};

const buildLimitedProfilePayload = (payload = null) => {
  const code = String(payload?.error?.code || payload?.code || "PANEL_ACCESS_RESTRICTED").trim();
  const message = String(
    payload?.error?.message || payload?.message || "Business profile is not ready yet."
  ).trim();

  const limitedState = {
    authenticated: true,
    auth_limited: true,
    limited: true,
    panel_access_restricted: true,
    branch_required: true,
    has_business: false,
    business_registered: false,
    user: null,
    profile: null,
    code,
    message,
  };

  return {
    ...limitedState,
    data: {
      ...limitedState,
    },
    error: {
      code,
      message,
    },
    upstream_status: 403,
  };
};

const buildResponseHeaders = (upstreamResponse, extraHeaders = null, cookieContext = null) => {
  const headers = new Headers(upstreamResponse?.headers);
  headers.delete("content-length");
  if (extraHeaders instanceof Headers) {
    for (const [key, value] of extraHeaders.entries()) {
      if (!value || key.toLowerCase() === "set-cookie") continue;
      headers.set(key, value);
    }
    const setCookies = extraHeaders.get("set-cookie");
    if (setCookies) {
      appendSetCookieHeaders(headers, extraHeaders, cookieContext);
    }
  }
  return headers;
};

const copyResponse = async (upstreamResponse, extraHeaders = null, cookieContext = null) => {
  const headers = buildResponseHeaders(upstreamResponse, extraHeaders, cookieContext);
  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};

const createLimitedProfileResponse = async ({
  upstreamResponse,
  payload = null,
  extraHeaders = null,
  cookieContext = null,
}) => {
  const headers = buildResponseHeaders(upstreamResponse, extraHeaders, cookieContext);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-auth-profile-state", "limited");

  return NextResponse.json(buildLimitedProfilePayload(payload), {
    status: 200,
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
  forwardedHeaders = {},
}) => {
  const normalizedBase = String(base).replace(/\/+$/, "");
  const url = `${normalizedBase}${path}`;
  const headers = new Headers();
  headers.set("x-product-key", PRODUCT_KEY);
  
  if (forwardedHeaders["user-agent"]) headers.set("user-agent", forwardedHeaders["user-agent"]);
  if (forwardedHeaders["x-forwarded-for"]) headers.set("x-forwarded-for", forwardedHeaders["x-forwarded-for"]);
  if (forwardedHeaders["x-real-ip"]) headers.set("x-real-ip", forwardedHeaders["x-real-ip"]);
  if (forwardedHeaders["origin"]) headers.set("origin", forwardedHeaders["origin"]);
  if (forwardedHeaders["referer"]) headers.set("referer", forwardedHeaders["referer"]);

  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (csrfHeader) {
    headers.set("x-csrf-token", csrfHeader);
    headers.set("x-xsrf-token", csrfHeader);
    headers.set("csrf-token", csrfHeader);
  }
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

const requestRefresh = async ({ base, cookieHeader, csrfHeader, includeCsrf = true, forwardedHeaders = {} }) => {
  const normalizedBase = String(base).replace(/\/+$/, "");

  for (const path of REFRESH_PATH_CANDIDATES) {
    const url = `${normalizedBase}${path}`;
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("x-product-key", PRODUCT_KEY);

    if (forwardedHeaders["user-agent"]) headers.set("user-agent", forwardedHeaders["user-agent"]);
    if (forwardedHeaders["x-forwarded-for"]) headers.set("x-forwarded-for", forwardedHeaders["x-forwarded-for"]);
    if (forwardedHeaders["x-real-ip"]) headers.set("x-real-ip", forwardedHeaders["x-real-ip"]);
    if (forwardedHeaders["origin"]) headers.set("origin", forwardedHeaders["origin"]);
    if (forwardedHeaders["referer"]) headers.set("referer", forwardedHeaders["referer"]);

    if (cookieHeader) headers.set("cookie", cookieHeader);
    if (includeCsrf && csrfHeader) {
      headers.set("x-csrf-token", csrfHeader);
      headers.set("x-xsrf-token", csrfHeader);
      headers.set("csrf-token", csrfHeader);
    }

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
  const cookieContext = getCookieContext(request);
  const bases = getBaseCandidates();
  
  const forwardedHeaders = {
    "user-agent": request.headers.get("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "x-forwarded-for": request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
    "x-real-ip": request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "",
    "origin": request.headers.get("origin") || request.headers.get("Host") || "",
    "referer": request.headers.get("referer") || "",
  };

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
  const incomingCsrfHeader = String(
    request.headers.get("x-csrf-token") ||
      request.headers.get("x-xsrf-token") ||
      request.headers.get("csrf-token") ||
      ""
  ).trim();
  const incomingCsrfCookie = getFirstCookieValueFromHeader(incomingCookie, CSRF_COOKIE_KEYS);
  const incomingCsrf = incomingCsrfHeader || incomingCsrfCookie;
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
          forwardedHeaders,
        });

        lastResponse = response;
        if (response.ok) {
          const okPayload = await readJsonSafely(response);
          const profileBranchId =
            readProfileBranchId(okPayload) ||
            readText(
              request.cookies.get(BRANCH_PAYMENT_BRANCH_ID_COOKIE)?.value,
              request.cookies.get("branch_id")?.value
            );
          const trackedState = await getTrackedBranchPaymentState({
            branchId: profileBranchId,
            orderId: readText(request.cookies.get(BRANCH_PAYMENT_ORDER_ID_COOKIE)?.value),
            sessionId: readText(request.cookies.get(BRANCH_PAYMENT_SESSION_ID_COOKIE)?.value),
          });
          const explicitBranchStatus = readProfileBranchStatus(okPayload);
          const trackedBranchStatus = normalizeBranchPaymentStatus(
            readText(
              trackedState?.status,
              request.cookies.get(BRANCH_PAYMENT_STATUS_COOKIE)?.value
            )
          );
          const resolvedBranchStatus =
            explicitBranchStatus ||
            (trackedBranchStatus === BRANCH_PAYMENT_STATUS_FAILED ? trackedBranchStatus : "");

          if (shouldBlockBranchAccess(resolvedBranchStatus)) {
            await appendPaymentFlowLog({
              event: "access_blocked_non_active_branch",
              branchId: profileBranchId,
              businessId: readProfileBusinessId(okPayload),
              orderId: trackedState?.orderId,
              sessionId: trackedState?.sessionId,
              status: resolvedBranchStatus,
              source: "auth-me",
              error: `Branch status ${resolvedBranchStatus} is not ${BRANCH_PAYMENT_STATUS_ACTIVE}`,
            });

            return createLimitedProfileResponse({
              upstreamResponse: response,
              payload: {
                code: "BRANCH_NOT_ACTIVE",
                message: `Branch status is ${resolvedBranchStatus}. Only ACTIVE branches can access the dashboard.`,
              },
              cookieContext,
            });
          }

          return copyResponse(response, null, cookieContext);
        }

        const status = Number(response.status || 0);
        const initialPayload = status === 403 ? await readJsonSafely(response) : null;
        let skipInitialReturn = false;
        const shouldTryRefresh = status === 401 || status === 403;
        if (shouldTryRefresh) {
          const refreshResponse =
            (await requestRefresh({
              base,
              cookieHeader: incomingCookie,
              csrfHeader: incomingCsrf,
              includeCsrf: true,
              forwardedHeaders,
            })) ||
            (incomingCsrf
              ? await requestRefresh({
                  base,
                  cookieHeader: incomingCookie,
                  csrfHeader: incomingCsrf,
                  includeCsrf: false,
                  forwardedHeaders,
                })
              : null);

          if (refreshResponse?.ok) {
            const responseHeaders = new Headers();
            appendSetCookieHeaders(responseHeaders, refreshResponse.headers, cookieContext);
            const refreshedCookieJar = new Map(initialCookieJar);
            applySetCookiesToJar(refreshedCookieJar, refreshResponse.headers);
            const mergedCookieHeader = toCookieHeader(refreshedCookieJar);
            const refreshedAccessToken = await readAccessTokenFromRefresh(refreshResponse);
            const refreshedCsrfToken = await readCsrfTokenFromRefresh(refreshResponse);
            const csrfAfterRefresh =
              getFirstCookieValueFromHeader(mergedCookieHeader, CSRF_COOKIE_KEYS) ||
              refreshedCsrfToken ||
              incomingCsrf;

            if (refreshedAccessToken) {
              responseHeaders.set("authorization", `Bearer ${refreshedAccessToken}`);
            }
            if (csrfAfterRefresh) {
              responseHeaders.set("x-csrf-token", csrfAfterRefresh);
              responseHeaders.set("x-xsrf-token", csrfAfterRefresh);
              responseHeaders.set("csrf-token", csrfAfterRefresh);
            }

            const retryProfile = await requestProfile({
              base,
              path,
              cookieHeader: mergedCookieHeader,
              csrfHeader: csrfAfterRefresh,
              authorizationHeader: refreshedAccessToken ? `Bearer ${refreshedAccessToken}` : "",
              accessToken: refreshedAccessToken,
              forwardedHeaders,
            });

            const retryStatus = Number(retryProfile.status || 0);
            const retryPayload = retryStatus === 403 ? await readJsonSafely(retryProfile) : null;
            if (retryStatus === 403 && isPanelAccessRestrictedPayload(retryPayload)) {
              return createLimitedProfileResponse({
                upstreamResponse: retryProfile,
                payload: retryPayload,
                extraHeaders: responseHeaders,
                cookieContext,
              });
            }
            const response = await copyResponse(retryProfile, responseHeaders, cookieContext);
            if (retryProfile.ok || ![404, 405, 500, 502, 503, 504].includes(retryStatus)) {
              return response;
            }
            skipInitialReturn = true;
          }
        }

        if (!skipInitialReturn && ![404, 405, 500, 502, 503, 504].includes(status)) {
          if (status === 403 && isPanelAccessRestrictedPayload(initialPayload)) {
            return createLimitedProfileResponse({
              upstreamResponse: response,
              payload: initialPayload,
              cookieContext,
            });
          }
          return copyResponse(response, null, cookieContext);
        }
      } catch {
        // Try next candidate.
      }
    }
  }

  if (lastResponse) return copyResponse(lastResponse, null, cookieContext);
  return NextResponse.json(
    { error: { code: "UPSTREAM_PROFILE_UNAVAILABLE", message: "Unable to reach profile upstream" } },
    { status: 502 }
  );
}
