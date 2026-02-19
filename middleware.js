import { NextResponse } from "next/server";

const LISTING_APP_BASE_URL = (process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://localhost:1001").replace(
  /\/+$/,
  ""
);

const hasSessionCookie = (request) => {
  const cookies = request.cookies.getAll();
  return cookies.some((cookie) => {
    const name = String(cookie?.name || "").toLowerCase();
    if (!name) return false;
    return name === "access_token" || name === "refresh_token" || name.startsWith("access_token_") || name.startsWith("refresh_token_");
  });
};

const AUTH_PAGES = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/otp",
  "/auth/email-otp",
]);

export function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const isAuthenticated = hasSessionCookie(request);

  if (pathname === "/auth/business-register" && !isAuthenticated) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_PAGES.has(pathname) && isAuthenticated) {
    const target = request.nextUrl.searchParams.get("returnTo");
    if (target) {
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.redirect(new URL(`${LISTING_APP_BASE_URL}/dashboard`));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*"],
};
