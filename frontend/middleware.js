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

const hasAnyCookie = (request, names = []) =>
  names.some((name) => Boolean(String(request.cookies.get(name)?.value || "").trim()));

const hasSessionCookie = (request) => {
  return hasAnyCookie(request, REFRESH_COOKIE_KEYS);
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

const hasValidatedSession = async (request) => {
  try {
    const response = await fetch(new URL("/api/auth/me", request.url), {
      method: "GET",
      headers: {
        cookie: String(request.headers.get("cookie") || ""),
        "x-product-key": String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property",
      },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
};

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  let hasSession = hasSessionCookie(request);
  const hasSignupOtpProof = Boolean(String(request.cookies.get(SIGNUP_OTP_PROOF_COOKIE)?.value || "").trim());
  const shouldProbeSession =
    pathname.startsWith("/dashboard") ||
    AUTH_ENTRY_PATHS.has(pathname) ||
    pathname === "/auth/complete-profile";
  if (!hasSession && shouldProbeSession) {
    hasSession = await hasValidatedSession(request);
  }

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
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
