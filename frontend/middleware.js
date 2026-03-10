import { NextResponse } from "next/server";
const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
];
const CSRF_COOKIE_KEYS = ["csrf_token_property", "csrf_token"];
const AUTH_ENTRY_PATHS = new Set([
  "/auth/login",
  "/auth/home",
  "/auth/business-option",
]);

const toBool = (value) => {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const readProfilePayload = (payload) => {
  const profile =
    payload?.data?.profile ||
    payload?.data?.user ||
    payload?.data ||
    payload?.profile ||
    payload?.user ||
    payload;
  return profile && typeof profile === "object" ? profile : null;
};

const hasBusinessFromProfile = (profile) => {
  const data = profile || {};

  if (toBool(data.is_business_registered)) return true;
  if (toBool(data.has_business) || toBool(data.business_registered) || toBool(data.is_business)) {
    return true;
  }
  if (typeof data.business_count === "number" && data.business_count > 0) return true;

  if (
    data.business_id ||
    data.business_uuid ||
    data.branch_id ||
    data.branch_uuid ||
    data.broker_id ||
    data.company_id
  ) {
    return true;
  }

  if (Array.isArray(data.businesses) && data.businesses.length > 0) return true;
  if (Array.isArray(data.user_businesses) && data.user_businesses.length > 0) return true;
  if (Array.isArray(data.branches) && data.branches.length > 0) return true;
  if (Array.isArray(data.user_branches) && data.user_branches.length > 0) return true;

  return false;
};

const hasAnyCookie = (request, names = []) =>
  names.some((name) => Boolean(String(request.cookies.get(name)?.value || "").trim()));

const hasSessionCookie = (request) => {
  return hasAnyCookie(request, REFRESH_COOKIE_KEYS);
};
const hasCsrfCookie = (request) => hasAnyCookie(request, CSRF_COOKIE_KEYS);

const getSafeInternalReturnPath = (request) => {
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
};

const hasCrossOriginReturnTo = (request) => {
  const returnTo = String(request.nextUrl.searchParams.get("returnTo") || "").trim();
  if (!returnTo || returnTo.startsWith("/")) return false;
  try {
    const parsed = new URL(returnTo);
    return parsed.origin !== request.nextUrl.origin;
  } catch {
    return false;
  }
};

const redirectForAuthenticatedAuthPage = (request) => {
  const safeReturnPath = getSafeInternalReturnPath(request);
  if (safeReturnPath) {
    return NextResponse.redirect(new URL(safeReturnPath, request.url));
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
};

const getValidatedSessionState = async (request) => {
  try {
    const response = await fetch(new URL("/api/auth/me", request.url), {
      method: "GET",
      headers: {
        cookie: String(request.headers.get("cookie") || ""),
        "x-product-key": String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property",
      },
      cache: "no-store",
    });
    
    if (response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const profile = readProfilePayload(payload);
      return {
        authenticated: true,
        hasBusiness: hasBusinessFromProfile(profile || {}),
      };
    }
    
    // If we get 401/403 and have a refresh token, the /api/auth/me endpoint
    // should have already attempted refresh. If it still fails, session is invalid.
    return { authenticated: false, hasBusiness: false };
  } catch {
    return { authenticated: false, hasBusiness: false };
  }
};

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const hasRefreshCookie = hasSessionCookie(request);
  const hasCsrfSessionHint = hasCsrfCookie(request);
  let hasSession = hasRefreshCookie;
  let hasBusiness = false;
  let probeAuthenticated = false;
  const shouldProbeSession =
    pathname.startsWith("/dashboard") ||
    AUTH_ENTRY_PATHS.has(pathname) ||
    pathname === "/auth/complete-profile";

  if (shouldProbeSession) {
    const sessionState = await getValidatedSessionState(request);
    hasSession = sessionState.authenticated;
    hasBusiness = sessionState.hasBusiness;
    probeAuthenticated = sessionState.authenticated;
  }

  const hasRecoverableSession = !hasSession && (hasRefreshCookie || hasCsrfSessionHint);

  if (pathname.startsWith("/dashboard") && !hasSession && !hasRecoverableSession) {
    // Do not hard-redirect dashboard requests at middleware layer.
    // Client auth bootstrap can still restore using Authorization + CSRF hints
    // immediately after SSO handoff, which middleware cannot observe.
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard") && probeAuthenticated && !hasBusiness) {
    // Keep dashboard transition stable; business gating is enforced in client shell
    // using resolved profile data/cookies after auth restore.
    return NextResponse.next();
  }

  if (AUTH_ENTRY_PATHS.has(pathname) && hasSession) {
    if (hasCrossOriginReturnTo(request)) {
      return NextResponse.next();
    }
    return redirectForAuthenticatedAuthPage(request);
  }

  if (pathname === "/auth/complete-profile" && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*", "/dashboard/:path*"],
};
