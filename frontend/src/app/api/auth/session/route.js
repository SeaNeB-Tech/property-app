import { NextResponse } from "next/server";

const REFRESH_COOKIE_KEYS = [
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
];

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

const hasAnyRefreshCookie = (cookieHeader) => {
  for (const key of REFRESH_COOKIE_KEYS) {
    if (String(getCookieValueFromHeader(cookieHeader, key) || "").trim()) {
      return true;
    }
  }
  return false;
};

export async function GET(request) {
  const cookieHeader = String(request.headers.get("cookie") || "").trim();
  const hasRefreshSession = hasAnyRefreshCookie(cookieHeader);
  const hasCsrfCookie = Boolean(
    String(getCookieValueFromHeader(cookieHeader, "csrf_token_property") || "").trim()
  );

  return NextResponse.json(
    {
      success: true,
      hasRefreshSession,
      hasCsrfCookie,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
