// src/services/authservice.js

import api from "@/services/api";
import { getDefaultProductKey, getDefaultProductName, setDefaultProductKey } from "@/services/pro.service";
import { getJsonCookie, getCookie } from "@/services/cookie";
import { authStore } from "./store/authStore";


const IDENTIFIER_TYPE_MOBILE = 0;
const PURPOSE_SIGNUP_OR_LOGIN = 0;
const getRefreshProductKeyCandidates = () => ["property"];
const getBasePath = () => {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
};
const withBasePath = (path) => `${getBasePath()}${path}`;

const isProductNotFoundError = (err) => {
  const status = err?.response?.status;
  const message =
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    "";
  return status === 404 && String(message).toLowerCase().includes("product not found");
};

const ensureLoginProduct = async () => {
  const productKey = getDefaultProductKey();
  try {
    await api.post("/products", {
      product_key: productKey,
      product_name: getDefaultProductName(),
    });
    return true;
  } catch (err) {
    if (err?.response?.status === 409) return true;
    return false;
  }
};

const toBool = (value) => {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const detectExistingUser = (payload = {}) => {
  const nested =
    payload?.data ||
    payload?.result ||
    payload?.response ||
    payload?.payload ||
    {};

  return (
    toBool(payload?.is_existing_user) ||
    toBool(payload?.isExistingUser) ||
    toBool(payload?.user_exists) ||
    toBool(payload?.existing_user) ||
    toBool(nested?.is_existing_user) ||
    toBool(nested?.isExistingUser) ||
    toBool(nested?.user_exists) ||
    toBool(nested?.existing_user)
  );
};


/**
 * Verifies OTP.
 * Backend behavior:
 * - Sets refresh_token + csrf_token as HttpOnly cookies
 * - May return access_token + csrf_token in response body
 */
export const verifyOtpAndLogin = async ({ otp }) => {
  const ctx = getJsonCookie("otp_context");
  if (!ctx) throw new Error("OTP context missing");

  if (!ctx.country_code || !ctx.mobile_number) {
    throw new Error("Invalid OTP context");
  }

  const code = String(otp).trim();
  if (code.length !== 4) {
    throw new Error("OTP must be 4 digits");
  }

  const purpose =
    Number.isFinite(Number(ctx.purpose)) && String(ctx.purpose).trim() !== ""
      ? Number(ctx.purpose)
      : PURPOSE_SIGNUP_OR_LOGIN;

  const verifyPayload = {
    identifier_type: IDENTIFIER_TYPE_MOBILE,
    country_code: String(ctx.country_code).trim(),
    mobile_number: String(ctx.mobile_number).trim(),
    otp: code,
    purpose,
    product_key: getDefaultProductKey(),
  };

  console.log("OTP verify payload:", verifyPayload);
  let res;
  try {
    res = await api.post("/otp/verify-otp", verifyPayload, { withCredentials: true });
  } catch (err) {
    if (isProductNotFoundError(err) && (await ensureLoginProduct())) {
      res = await api.post("/otp/verify-otp", verifyPayload, { withCredentials: true });
    } else {
      throw err;
    }
  }

    console.log("OTP verified response:", res.data);

  // If backend returned tokens in the response, store them in authStore.
  // Preferred flow is HttpOnly refresh cookie set by backend; when backend
  // also returns tokens in body (for SPA-only flows) we persist them.
  const data = res.data || {};
  
  // Try to get CSRF from response body first, then from response headers
  let csrfToken = data?.csrf_token || res.headers?.["x-csrf-token"] || res.headers?.["csrf-token"];
  if (csrfToken) {
    authStore.setCsrfToken(csrfToken);
      console.log("\n[authservice] CSRF token captured from OTP verify response (length=" + csrfToken.length + ")");
  } else {
      console.warn("\n[authservice] WARNING: No CSRF token found in OTP response body or headers");
  }
  
  if (data?.access_token) {
    authStore.setAccessToken(data.access_token);
    console.log("[authservice] Access token set from OTP response");
  }
  if (data?.refresh_token) {
    authStore.setRefreshToken(data.refresh_token);
    console.log("[authservice] Refresh token set from OTP response");
  }

  //  START 6-HOUR SESSION IMMEDIATELY ON OTP VERIFY (not on dashboard load)
  authStore.setSessionStartTime();
    console.log("\n[authservice] Session started - 6 hour countdown begun");

  const isExistingUser = detectExistingUser(data);

  return {
    isExistingUser,
  };
};


/**
 * Generates access token using HttpOnly refresh_token cookie + CSRF token
 * CSRF token is obtained from cookies (persisted across page reloads)
 */
export const refreshAccessToken = async () => {
  console.log("\n[refreshAccessToken] Starting token refresh...");
  authStore.dumpAuthState();

  let csrf = authStore.getCsrfToken();
  if (!csrf) {
    csrf =
      getCookie("csrf_token") ||
      getCookie("csrf-token") ||
      getCookie("XSRF-TOKEN") ||
      getCookie("xsrf-token") ||
      getCookie("_csrf");
    if (csrf) authStore.setCsrfToken(csrf);
  }

  if (!csrf) {
    throw new Error("CSRF token missing, cannot refresh access token");
  }

  const refreshToken = authStore.getRefreshToken();
  const productKeyCandidates = getRefreshProductKeyCandidates();
  let res = null;
  let lastErr = null;

  for (const productKey of productKeyCandidates) {
    const requestBody = { product_key: productKey };
    if (refreshToken) requestBody.refresh_token = refreshToken;

    try {
      res = await api.post("/auth/refresh", requestBody, {
        withCredentials: true,
        headers: {
          "x-csrf-token": csrf,
          "Content-Type": "application/json",
        },
      });

      if (productKey !== getDefaultProductKey()) {
        setDefaultProductKey(productKey);
      }
      break;
    } catch (err) {
      lastErr = err;
      const status = Number(err?.response?.status || 0);
      const code = String(err?.response?.data?.error?.code || "").toUpperCase();
      const message = String(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          err?.message ||
          ""
      ).toLowerCase();

      const retryable =
        status === 400 ||
        status === 403 ||
        code.includes("PRODUCT") ||
        message.includes("product") ||
        message.includes("csrf");

      if (!retryable) break;
    }
  }

  if (!res) {
    throw lastErr || new Error("Refresh endpoint failed");
  }
  if (!res.data?.access_token) {
    throw new Error("No access_token returned from refresh");
  }

  const newAccessToken = res.data.access_token;
  authStore.setAccessToken(newAccessToken);

  const newCsrf =
    res?.data?.csrf_token ||
    res?.headers?.["x-csrf-token"] ||
    res?.headers?.["csrf-token"];
  if (newCsrf) {
    authStore.setCsrfToken(newCsrf);
  }

  return newAccessToken;
};
export const logout = async () => {
  try {
      console.log("\n[authservice] Logging out...");
    await api.post("/auth/logout", {}, { withCredentials: true });
  } catch (_) {
    // ignore
  } finally {
    console.log("    Session cleared");
    authStore.clearAll();
    console.log("   → Redirecting to login");
    window.location.href = withBasePath("/auth/login");
  }
};

