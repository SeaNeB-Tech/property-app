import { NextResponse } from "next/server";
const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
];
const AUTH_ENTRY_PATHS = new Set([
  "/auth/login",
  "/auth/home",
  "/auth/business-option",
]);
const SIGNUP_OTP_PROOF_COOKIE = "signup_otp_verified";
const BUSINESS_HINT_COOKIE_KEYS = [
  "business_registered",
  "business_id",
  "branch_id",
];

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

const hasBusinessHintCookie = (request) => {
  const businessRegistered = String(request.cookies.get("business_registered")?.value || "")
    .trim()
    .toLowerCase();
  if (businessRegistered === "true" || businessRegistered === "1" || businessRegistered === "yes") {
    return true;
  }
  return hasAnyCookie(request, BUSINESS_HINT_COOKIE_KEYS.filter((key) => key !== "business_registered"));
};

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
    if (!response.ok) {
      return { authenticated: false, hasBusiness: false };
    }

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
  } catch {
    return { authenticated: false, hasBusiness: false };
  }
};

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  let hasSession = hasSessionCookie(request);
  let hasBusiness = hasBusinessHintCookie(request);
  const hasSignupOtpProof = Boolean(String(request.cookies.get(SIGNUP_OTP_PROOF_COOKIE)?.value || "").trim());
  const shouldProbeSession =
    pathname.startsWith("/dashboard") ||
    AUTH_ENTRY_PATHS.has(pathname) ||
    pathname === "/auth/complete-profile";

  if (shouldProbeSession) {
    const sessionState = await getValidatedSessionState(request);
    hasSession = sessionState.authenticated;
    hasBusiness = sessionState.hasBusiness || (hasSession && hasBusinessHintCookie(request));
  }

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/dashboard") && !hasBusiness) {
    const businessRegisterUrl = new URL("/auth/business-register", request.url);
    businessRegisterUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(businessRegisterUrl);
  }

  if (AUTH_ENTRY_PATHS.has(pathname) && hasSession) {
    if (hasCrossOriginReturnTo(request)) {
      return NextResponse.next();
    }
    return redirectForAuthenticatedAuthPage(request);
  }

  if (pathname === "/auth/complete-profile" && !hasSession && !hasSignupOtpProof) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*", "/dashboard/:path*"],
};
