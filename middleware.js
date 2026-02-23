import { NextResponse } from "next/server";
const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
];

const hasAnyCookie = (request, names = []) =>
  names.some((name) => Boolean(String(request.cookies.get(name)?.value || "").trim()));

const hasSessionCookie = (request) => {
  return hasAnyCookie(request, REFRESH_COOKIE_KEYS);
};

const hasOtpInProgressCookie = (request) => {
  const value = String(request.cookies.get("otp_in_progress")?.value || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

export function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const hasSession = hasSessionCookie(request);
  const otpInProgress = hasOtpInProgressCookie(request);

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/auth/business-register" && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/auth/otp" || pathname === "/auth/email-otp") && otpInProgress) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*", "/dashboard/:path*"],
};
