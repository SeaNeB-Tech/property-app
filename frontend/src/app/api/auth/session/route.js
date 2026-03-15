import { NextResponse } from "next/server";
import { CSRF_COOKIE_KEYS, REFRESH_COOKIE_KEYS } from "@/lib/auth/cookieKeys";

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
  const hasRefreshCookieStore = REFRESH_COOKIE_KEYS.some((key) =>
    Boolean(String(request.cookies?.get(key)?.value || "").trim())
  );
  const hasCsrfCookieStore = CSRF_COOKIE_KEYS.some((key) =>
    Boolean(String(request.cookies?.get(key)?.value || "").trim())
  );
  const hasRefreshSession = hasAnyRefreshCookie(cookieHeader) || hasRefreshCookieStore;
  const hasCsrfCookie =
    CSRF_COOKIE_KEYS.some((key) =>
      Boolean(String(getCookieValueFromHeader(cookieHeader, key) || "").trim())
    ) || hasCsrfCookieStore;

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
