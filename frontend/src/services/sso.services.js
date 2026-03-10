import axios from "axios";
import { ssoDebugLog } from "@/lib/observability/ssoDebug";
import { hydrateAuthSession } from "@/lib/api/client";

const DEFAULT_PRODUCT_KEY = String(
  process.env.NEXT_PUBLIC_PRODUCT_KEY || "property"
)
  .trim()
  .toLowerCase();

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
        timeout: 8000,
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

    throw new Error(`SSO exchange failed${status ? ` (${status})` : ""}`);
  }

  const payload = response?.data || {};

  const accessToken = pickTokenValue(payload, [
    "access_token",
    "accessToken",
    "token",
  ]);
  const csrfToken = pickTokenValue(payload, [
    "csrf_token",
    "csrfToken",
    "csrf_token_property",
    "csrfTokenProperty",
  ]);

  if (accessToken || csrfToken) {
    hydrateAuthSession({ accessToken, csrfToken, broadcast: true });
  }

  try {
    const me = await axios.get("/api/auth/me", {
      withCredentials: true,
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {},
    });

    void me;
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
