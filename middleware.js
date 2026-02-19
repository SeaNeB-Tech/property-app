import { NextResponse } from "next/server";

const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const normalizeListingAppUrl = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) return normalized;
  try {
    const parsed = new URL(normalized);
    if (parsed.port === "8877" || parsed.port === "1002") {
      parsed.port = "1001";
      return normalizeUrl(parsed.toString());
    }
  } catch {
    return normalized;
  }
  return normalized;
};

const LISTING_APP_BASE_URL = normalizeListingAppUrl(
  process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://159.65.154.221:1001"
);

const hasAccessTokenCookie = (request) => {
  const cookies = request.cookies.getAll();
  return cookies.some((cookie) => {
    const name = String(cookie?.name || "").toLowerCase();
    if (!name) return false;
    return name === "access_token" || name.startsWith("access_token_");
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
  const hasAccessToken = hasAccessTokenCookie(request);

  if (pathname.startsWith("/dashboard") && !hasAccessToken) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/auth/business-register" && !hasAccessToken) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (AUTH_PAGES.has(pathname) && hasAccessToken) {
    const target = request.nextUrl.searchParams.get("returnTo");
    if (target) {
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.redirect(new URL(`${LISTING_APP_BASE_URL}/dashboard`));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*", "/dashboard/:path*"],
};
