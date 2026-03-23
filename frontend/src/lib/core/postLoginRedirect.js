"use client";

import {
  ensureAccessToken,
  getInMemoryAccessToken,
  getInMemoryCsrfToken,
} from "@/lib/api/client";
import { postLoginSuccessToOpener } from "@/lib/auth/crossTabMessaging";
import { API_BASE_URL } from "@/lib/core/apiBaseUrl";
import { getListingAppOrigin } from "@/lib/core/appUrls";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() || "property";
const AUTH_RETURN_TO_COOKIE = "auth_return_to";
const SOURCE_TO_TARGET_PATH = {
  "main-app": "/home",
  "main-app-register": "/auth/business-register",
};

export const getAllowedReturnOrigins = () => {
  const origin = getListingAppOrigin();
  return origin ? [origin] : [];
};

export const getPrimaryListingOrigin = () => getAllowedReturnOrigins()[0] || getListingAppOrigin() || "";

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
  const primaryListingOrigin = getPrimaryListingOrigin();
  const allowedReturnOrigins = getAllowedReturnOrigins();
  if (!target) return "";
  if (target.startsWith("/")) {
    if (!primaryListingOrigin) return "";
    try {
      return new URL(target, primaryListingOrigin).toString();
    } catch {
      return "";
    }
  }
  try {
    const parsed = new URL(target);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    const allowed = allowedReturnOrigins.length
      ? allowedReturnOrigins.includes(parsed.origin)
      : (primaryListingOrigin ? parsed.origin === primaryListingOrigin : true);
    if (allowed) return parsed.toString();

    // Safety rewrite: if callback accidentally points to auth origin, move it to listing origin.
    if (
      primaryListingOrigin &&
      typeof window !== "undefined" &&
      parsed.origin === window.location.origin &&
      parsed.pathname === "/auth/sso/callback"
    ) {
      const rewritten = new URL(parsed.pathname + parsed.search + parsed.hash, primaryListingOrigin);
      return rewritten.toString();
    }

    return "";
  } catch {
    return "";
  }
};

const buildDefaultListingCallback = () => {
  const primaryListingOrigin = getPrimaryListingOrigin();
  if (!primaryListingOrigin) return "";
  const callbackUrl = new URL("/auth/sso/callback", primaryListingOrigin);
  callbackUrl.searchParams.set("source", `${primaryListingOrigin}/home`);
  return callbackUrl.toString();
};

const buildListingCallbackForSource = (targetUrl) => {
  const primaryListingOrigin = getPrimaryListingOrigin();
  if (!primaryListingOrigin) return "";
  const callbackUrl = new URL("/auth/sso/callback", primaryListingOrigin);
  callbackUrl.searchParams.set("source", String(targetUrl || `${primaryListingOrigin}/home`).trim());
  return callbackUrl.toString();
};

const mintBridgeToken = async () => {
  const apiBase = String(API_BASE_URL || "").trim().replace(/\/+$/, "") || "/api";
  const endpoints = [`${apiBase}/sso`, `${apiBase}/v1/sso`, `${apiBase}/auth/sso`];
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
  const primaryListingOrigin = getPrimaryListingOrigin();
  const safeSourceTarget =
    sanitizeReturnTo(returnTo) ||
    sanitizeReturnTo(sourceTargetPath) ||
    (primaryListingOrigin ? `${primaryListingOrigin}/home` : "");
  const callbackUrl = buildListingCallbackForSource(safeSourceTarget) || buildDefaultListingCallback();
  if (!callbackUrl) return false;

  const fromPayload = readBridgeTokenFromPayload(sourcePayload || {});

  if (!fromPayload && !getInMemoryAccessToken()) {
    await ensureAccessToken();
  }

  const bridgeToken = fromPayload || (await mintBridgeToken());

  if (!getInMemoryAccessToken()) {
    await ensureAccessToken();
  }

  postLoginSuccessToOpener({
    accessToken: getInMemoryAccessToken(),
    csrfToken: getInMemoryCsrfToken(),
    returnTo: safeSourceTarget,
  });

  clearReturnToCookie();
  if (!bridgeToken) {
    // Fallback for deployments where SSO bridge mint endpoint is unavailable.
    // Let listing app restore session directly via shared auth cookies.
    window.location.replace(safeSourceTarget);
    return true;
  }

  const destination = appendBridgeToken(callbackUrl, bridgeToken);

  window.location.replace(destination);
  return true;
};
