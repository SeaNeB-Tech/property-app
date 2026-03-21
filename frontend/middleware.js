import { NextResponse } from "next/server";
import { CSRF_COOKIE_KEYS, REFRESH_COOKIE_KEYS } from "@/lib/auth/cookieKeys";

// ✅ ENV driven — no hardcoded fallbacks
const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim();
const BASE_PATH = "";
const MIDDLEWARE_REFRESH_THROTTLE_MS = 3000;
const SESSION_FETCH_TIMEOUT_MS = 4000;

if (!PRODUCT_KEY) console.warn("[middleware] NEXT_PUBLIC_PRODUCT_KEY is not set");

// ✅ Auth entry paths — pages only logged-OUT users should see
const AUTH_ENTRY_PATHS = new Set([
  "/auth/login",
  "/auth/home",
  "/auth/business-option",
  "/auth/register",
  "/auth/forgot-password",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeBasePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function withBasePath(request, path = "") {
  const basePath = normalizeBasePath(request?.nextUrl?.basePath || "") || BASE_PATH;
  const safePath = String(path || "");
  if (!safePath) return basePath || "";
  return safePath.startsWith("/") ? `${basePath}${safePath}` : `${basePath}/${safePath}`;
}

function hasAnyCookie(request, names = []) {
  return names.some((name) => Boolean(String(request.cookies.get(name)?.value || "").trim()));
}

function hasSessionCookie(request) {
  return hasAnyCookie(request, REFRESH_COOKIE_KEYS);
}

function hasCsrfCookie(request) {
  return hasAnyCookie(request, CSRF_COOKIE_KEYS);
}

function hasPostOtpVerified(request) {
  return hasAnyCookie(request, ["post_otp_verified"]);
}

function getSafeInternalReturnPath(request) {
  const returnTo = String(request.nextUrl.searchParams.get("returnTo") || "").trim();
  if (!returnTo) return "";
  if (returnTo.startsWith("/")) return returnTo;
  try {
    const parsed = new URL(returnTo);
    if (parsed.origin !== request.nextUrl.origin) return "";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}

function hasCrossOriginReturnTo(request) {
  const returnTo = String(request.nextUrl.searchParams.get("returnTo") || "").trim();
  if (!returnTo || returnTo.startsWith("/")) return false;
  try {
    const parsed = new URL(returnTo);
    return parsed.origin !== request.nextUrl.origin;
  } catch {
    return false;
  }
}

function getSetCookieLines(headers) {
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
}

function appendSetCookieHeaders(targetResponse, sourceHeaders) {
  for (const cookie of getSetCookieLines(sourceHeaders)) {
    targetResponse.headers.append("set-cookie", cookie);
  }
}

function readProfilePayload(payload) {
  const profile =
    payload?.data?.profile ||
    payload?.data?.user ||
    payload?.data ||
    payload?.profile ||
    payload?.user ||
    payload;
  return profile && typeof profile === "object" ? profile : null;
}

function toBool(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function hasBusinessFromProfile(profile) {
  const data = profile || {};
  if (toBool(data.is_business_registered)) return true;
  if (toBool(data.has_business) || toBool(data.business_registered) || toBool(data.is_business)) return true;
  if (typeof data.business_count === "number" && data.business_count > 0) return true;
  if (data.business_id || data.business_uuid || data.branch_id || data.branch_uuid || data.broker_id || data.company_id) return true;
  if (Array.isArray(data.businesses) && data.businesses.length > 0) return true;
  if (Array.isArray(data.user_businesses) && data.user_businesses.length > 0) return true;
  if (Array.isArray(data.branches) && data.branches.length > 0) return true;
  if (Array.isArray(data.user_branches) && data.user_branches.length > 0) return true;
  return false;
}

// ✅ Per-request throttle via cookie — safe for serverless (no global state)
function isRecentlyValidated(request) {
  const lastAt = Number(request.cookies.get("_mw_refresh_at")?.value || 0);
  return Date.now() - lastAt < MIDDLEWARE_REFRESH_THROTTLE_MS;
}

function setValidatedCookie(response) {
  response.cookies.set({
    name: "_mw_refresh_at",
    value: String(Date.now()),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: Math.ceil(MIDDLEWARE_REFRESH_THROTTLE_MS / 1000),
  });
}

// ✅ Fetch with timeout — prevents hanging middleware
async function fetchWithTimeout(url, options = {}, timeoutMs = SESSION_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ✅ Validate session by calling auth/me
async function getValidatedSessionState(request) {
  try {
    const response = await fetchWithTimeout(
      new URL(withBasePath(request, "/api/auth/me"), request.url),
      {
        method: "GET",
        headers: {
          cookie: String(request.headers.get("cookie") || ""),
          "x-product-key": PRODUCT_KEY,
        },
        cache: "no-store",
      }
    );

    if (!response) return { authenticated: false, hasBusiness: false, setCookies: [] };

    const setCookies = getSetCookieLines(response.headers);

    if (response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      const profile = readProfilePayload(payload);
      return {
        authenticated: true,
        hasBusiness: hasBusinessFromProfile(profile || {}),
        setCookies,
      };
    }

    return { authenticated: false, hasBusiness: false, setCookies };
  } catch {
    return { authenticated: false, hasBusiness: false, setCookies: [] };
  }
}

// ✅ Try refresh session with timeout
async function tryRefreshSession(request) {
  return await fetchWithTimeout(
    new URL(withBasePath(request, "/api/auth/refresh"), request.url),
    {
      method: "POST",
      headers: {
        cookie: String(request.headers.get("cookie") || ""),
        "x-product-key": PRODUCT_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ product_key: PRODUCT_KEY }),
      cache: "no-store",
    }
  );
}

// ─── Main Middleware ─────────────────────────────────────────────────────────

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const hasRefreshCookie = hasSessionCookie(request);
  const hasCsrfSessionHint = hasCsrfCookie(request);

  let hasSession = hasRefreshCookie;
  let hasBusiness = false;
  let probeAuthenticated = false;
  let sessionSetCookies = [];

  // ✅ Only probe session on dashboard and complete-profile (NOT on auth pages)
  const shouldProbeSession =
    pathname.startsWith("/dashboard") ||
    pathname === "/auth/complete-profile";

  if (shouldProbeSession) {
    // ✅ Use per-request cookie throttle — safe for serverless
    const throttled = isRecentlyValidated(request);

    if (throttled && (hasRefreshCookie || hasCsrfSessionHint)) {
      hasSession = true;
      hasBusiness = true;
      probeAuthenticated = true;
    } else {
      const sessionState = await getValidatedSessionState(request);
      hasSession = sessionState.authenticated;
      hasBusiness = sessionState.hasBusiness;
      probeAuthenticated = sessionState.authenticated;
      sessionSetCookies = sessionState.setCookies || [];
    }
  }

  // ✅ Try refresh if session is recoverable
  const hasRecoverableSession = !hasSession && (hasRefreshCookie || hasCsrfSessionHint);
  const shouldSkipRefresh = isRecentlyValidated(request);
  const refreshResponse =
    hasRecoverableSession && !shouldSkipRefresh
      ? await tryRefreshSession(request)
      : null;

  if (refreshResponse?.ok) {
    hasSession = true;
    probeAuthenticated = true;
  }

  let response = null;

  // ✅ FIXED: Redirect unauthenticated users from dashboard to login
  if (pathname.startsWith("/dashboard") && !hasSession && !hasRecoverableSession) {
    const loginUrl = new URL(withBasePath(request, "/auth/login"), request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    response = NextResponse.redirect(loginUrl);
  }

  // ✅ Dashboard with session but no business — let client handle
  if (!response && pathname.startsWith("/dashboard") && probeAuthenticated && !hasBusiness) {
    response = NextResponse.next();
  }

  // ✅ Auth pages — redirect logged-in users to dashboard
  if (!response && AUTH_ENTRY_PATHS.has(pathname) && hasSession) {
    if (hasCrossOriginReturnTo(request)) {
      response = NextResponse.next();
    } else {
      const safeReturnPath = getSafeInternalReturnPath(request);
      response = NextResponse.redirect(
        new URL(safeReturnPath || withBasePath(request, "/dashboard"), request.url)
      );
    }
  }

  // ✅ Complete profile — needs post_otp_verified cookie
  if (!response && pathname === "/auth/complete-profile" && !hasSession) {
    if (hasPostOtpVerified(request)) {
      response = NextResponse.next();
    } else {
      const loginUrl = new URL(withBasePath(request, "/auth/login"), request.url);
      loginUrl.searchParams.set("returnTo", request.nextUrl.href);
      response = NextResponse.redirect(loginUrl);
    }
  }

  // ✅ Default — let request through
  if (!response) {
    response = NextResponse.next();
  }

  // ✅ Set throttle cookie after successful validation
  if (probeAuthenticated || refreshResponse?.ok) {
    setValidatedCookie(response);
  }

  // ✅ Forward cookies from session probe
  if (sessionSetCookies.length) {
    for (const cookie of sessionSetCookies) {
      response.headers.append("set-cookie", cookie);
    }
  }

  // ✅ Forward cookies from refresh
  if (refreshResponse?.headers) {
    appendSetCookieHeaders(response, refreshResponse.headers);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
