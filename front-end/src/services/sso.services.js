import axios from "axios";
import { authStore } from "@/app/auth/auth-service/store/authStore";
import { ssoDebugLog } from "@/lib/observability/ssoDebug";

const DEFAULT_PRODUCT_KEY = String(
  process.env.NEXT_PUBLIC_PRODUCT_KEY || "property"
)
  .trim()
  .toLowerCase();

/**
 * Safely pick token from multiple possible backend formats
 */
const pickTokenValue = (payload, keys) => {
  if (!payload) return "";

  const list = Array.isArray(keys) ? keys : [keys];

  for (const key of list) {
    const value =
      payload?.[key] ||
      payload?.data?.[key] ||
      payload?.tokens?.[key] ||
      payload?.data?.tokens?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

/**
 * Exchange SSO bridge token for a session.
 * Backend is expected to set cookie session.
 */
export const exchangeSsoBridgeToken = async (bridgeToken) => {
  const token = String(bridgeToken || "").trim();

  if (!token) {
    throw new Error("Missing bridge token");
  }

  if (!DEFAULT_PRODUCT_KEY) {
    throw new Error("Missing target product key");
  }

  ssoDebugLog("sso.exchange.start", {
    route: "/api/v1/sso/exchange",
  });

  let response;

  try {
    response = await axios.post(
      "/api/v1/sso/exchange",
      {
        bridge_token: token,
        target_product_key: DEFAULT_PRODUCT_KEY,
      },
      {
        withCredentials: true,
        headers: {
          "Content-Type": "application/json",
          "x-product-key": DEFAULT_PRODUCT_KEY,
        },
      }
    );
  } catch (error) {
    const status = Number(error?.response?.status || 0);

    ssoDebugLog("sso.exchange.failure", {
      route: "/api/v1/sso/exchange",
      status,
    });

    throw new Error(
      `SSO exchange failed${status ? ` (${status})` : ""}`
    );
  }

  const payload = response?.data || {};

  const accessToken = pickTokenValue(payload, [
    "access_token",
    "accessToken",
    "token",
  ]);

  /**
   * If backend returns token → hydrate store
   * If cookie session only → mark as cookie session
   */
  if (accessToken) {
    authStore?.setAccessToken?.(accessToken);
  } else {
    authStore?.setAccessToken?.("COOKIE_SESSION");
  }

  /**
   * Verify session after exchange
   * This ensures authStore user state is synced
   */
  try {
    const me = await axios.get("/api/auth/me", {
      withCredentials: true,
    });

    if (me?.data) {
      authStore?.setUser?.(me.data);
    }
  } catch (error) {
    ssoDebugLog("sso.exchange.verify_failed", {
      status: Number(error?.response?.status || 0),
    });
  }

  ssoDebugLog("sso.exchange.success", {
    route: "/api/v1/sso/exchange",
    status: Number(response?.status || 200),
    hasAccessToken: Boolean(accessToken),
  });

  return payload;
};