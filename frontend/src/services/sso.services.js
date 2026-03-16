import axios from "axios";
import { ssoDebugLog } from "@/lib/observability/ssoDebug";
import { hydrateAuthSession } from "@/lib/api/client";
import { clearAuthFailureArtifacts, shouldClearAuthOnError } from "@/services/auth.service";
import { API_BASE_URL } from "@/lib/core/apiBaseUrl";

const DEFAULT_PRODUCT_KEY = String(
  process.env.NEXT_PUBLIC_PRODUCT_KEY || "property"
)
  .trim()
  .toLowerCase();

const setSsoLockActive = () => {
  if (typeof window === "undefined") return;
  window.__ACTIVE_SSO_LOCK__ = true;
};

const clearSsoLockLater = () => {
  if (typeof window === "undefined") return;
  setTimeout(() => {
    try {
      delete window.__ACTIVE_SSO_LOCK__;
    } catch {
      window.__ACTIVE_SSO_LOCK__ = undefined;
    }
  }, 1500);
};

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

  setSsoLockActive();

  try {
    ssoDebugLog("sso.exchange.start", {
      route: "/api/v1/sso/exchange",
    });

    let response;

    const apiBase = String(API_BASE_URL || "").trim().replace(/\/+$/, "") || "/api";

    try {
      response = await axios.post(
        `${apiBase}/v1/sso/exchange`,
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

      if (shouldClearAuthOnError(error)) {
        clearAuthFailureArtifacts();
      }

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
      const me = await axios.get(`${apiBase}/auth/me`, {
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
  } finally {
    clearSsoLockLater();
  }
};
