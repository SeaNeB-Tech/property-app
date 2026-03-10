"use client";

import { getInMemoryAccessToken } from "@/lib/api/client";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
const AUTH_RETURN_TO_COOKIE = "auth_return_to";
const LISTING_APP_ORIGIN = (() => {
  try {
    return new URL(String(process.env.NEXT_PUBLIC_APP_URL || "").trim()).origin;
  } catch {
    return "";
  }
})();
const ALLOWED_RETURN_ORIGINS = Array.from(
  new Set(
    String(process.env.NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS || "")
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .concat(LISTING_APP_ORIGIN ? [LISTING_APP_ORIGIN] : [])
  )
);
const PRIMARY_LISTING_ORIGIN = ALLOWED_RETURN_ORIGINS[0] || LISTING_APP_ORIGIN || "";
const SOURCE_TO_TARGET_PATH = {
  "main-app": "/home",
  "main-app-register": "/auth/business-register",
};

export const getAllowedReturnOrigins = () => [...ALLOWED_RETURN_ORIGINS];

export const getPrimaryListingOrigin = () => PRIMARY_LISTING_ORIGIN;

const readBridgeTokenFromPayload = (payload = {}) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.payload,
    payload?.session,
    payload?.tokens,
    payload?.token,
    payload?.data?.token,
    payload?.data?.tokens,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const token = String(
      candidate?.bridge_token ||
        candidate?.bridgeToken ||
        candidate?.sso_bridge_token ||
        candidate?.ssoBridgeToken ||
        ""
    ).trim();
    if (token) return token;
  }
  return "";
};

const sanitizeReturnTo = (value) => {
  const target = String(value || "").trim();
  if (!target) return "";
  if (target.startsWith("/")) {
    if (!PRIMARY_LISTING_ORIGIN) return "";
    try {
      return new URL(target, PRIMARY_LISTING_ORIGIN).toString();
    } catch {
      return "";
    }
  }
  try {
    const parsed = new URL(target);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    const allowed = ALLOWED_RETURN_ORIGINS.length
      ? ALLOWED_RETURN_ORIGINS.includes(parsed.origin)
      : (LISTING_APP_ORIGIN ? parsed.origin === LISTING_APP_ORIGIN : true);
    if (allowed) return parsed.toString();

    // Safety rewrite: if callback accidentally points to auth origin, move it to listing origin.
    if (
      PRIMARY_LISTING_ORIGIN &&
      typeof window !== "undefined" &&
      parsed.origin === window.location.origin &&
      parsed.pathname === "/auth/sso/callback"
    ) {
      const rewritten = new URL(parsed.pathname + parsed.search + parsed.hash, PRIMARY_LISTING_ORIGIN);
      return rewritten.toString();
    }

    return "";
  } catch {
    return "";
  }
};

const buildDefaultListingCallback = () => {
  if (!PRIMARY_LISTING_ORIGIN) return "";
  const callbackUrl = new URL("/auth/sso/callback", PRIMARY_LISTING_ORIGIN);
  callbackUrl.searchParams.set("source", `${PRIMARY_LISTING_ORIGIN}/home`);
  return callbackUrl.toString();
};

const buildListingCallbackForSource = (targetUrl) => {
  if (!PRIMARY_LISTING_ORIGIN) return "";
  const callbackUrl = new URL("/auth/sso/callback", PRIMARY_LISTING_ORIGIN);
  callbackUrl.searchParams.set("source", String(targetUrl || `${PRIMARY_LISTING_ORIGIN}/home`).trim());
  return callbackUrl.toString();
};

const mintBridgeToken = async () => {
  const endpoints = ["/api/sso", "/api/v1/sso", "/api/auth/sso"];
  for (const endpoint of endpoints) {
    try {
      const accessToken = String(getInMemoryAccessToken() || "").trim();
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "x-product-key": PRODUCT_KEY,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          product_key: PRODUCT_KEY,
          target_product_key: PRODUCT_KEY,
        }),
      });
      if (!response.ok) {
        const status = Number(response.status || 0);
        if (status === 404 || status === 405) continue;
        return "";
      }
      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }
      const token = readBridgeTokenFromPayload(payload);
      if (token) return token;
    } catch {
      // try next endpoint
    }
  }
  return "";
};

const appendBridgeToken = (returnTo, bridgeToken) => {
  const callbackUrl = new URL(returnTo);
  callbackUrl.searchParams.set("bridge_token", bridgeToken);
  return callbackUrl.toString();
};

const clearReturnToCookie = () => {
  try {
    document.cookie = `${AUTH_RETURN_TO_COOKIE}=; path=/; max-age=0; SameSite=None`;
  } catch {
    // ignore cookie errors
  }
};

export const redirectToListingWithBridgeToken = async ({
  returnTo = "",
  source = "",
  sourcePayload = null,
} = {}) => {
  if (typeof window === "undefined") return false;
  const normalizedSource = String(source || "").trim().toLowerCase();
  const sourceTargetPath = SOURCE_TO_TARGET_PATH[normalizedSource] || "";
  const safeSourceTarget =
    sanitizeReturnTo(returnTo) || sanitizeReturnTo(sourceTargetPath) || `${PRIMARY_LISTING_ORIGIN}/home`;
  const callbackUrl = buildListingCallbackForSource(safeSourceTarget) || buildDefaultListingCallback();
  if (!callbackUrl) return false;

  const fromPayload = readBridgeTokenFromPayload(sourcePayload || {});
  const bridgeToken = fromPayload || (await mintBridgeToken());

  clearReturnToCookie();
  if (!bridgeToken) {
    // Fallback for deployments where SSO bridge mint endpoint is unavailable.
    // Let listing app restore session directly via shared auth cookies.
    window.location.replace(safeSourceTarget);
    return true;
  }

  const destination = appendBridgeToken(callbackUrl, bridgeToken);

  // If auth was opened from the listing app in another tab/window, reuse it and close this auth tab.
  try {
    const canUseOpener =
      (normalizedSource === "main-app" || normalizedSource === "main-app-register") &&
      typeof window.opener !== "undefined" &&
      window.opener &&
      !window.opener.closed;

    if (canUseOpener) {
      window.opener.location.href = destination;
      window.close();
      return true;
    }
  } catch {
    // Fallback to same-tab redirect when opener cannot be used due to browser policies.
  }

  window.location.replace(destination);
  return true;
};
