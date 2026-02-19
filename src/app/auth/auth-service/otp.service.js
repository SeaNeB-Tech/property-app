import api from "@/services/api";
import { authStore } from "./store/authStore";
import { getDefaultProductKey, getDefaultProductName } from "@/services/pro.service";
import { getJsonCookie, setJsonCookie } from "@/services/cookie";

const IDENTIFIER_TYPE_MOBILE = 0;
const PURPOSE_SIGNUP_OR_LOGIN = 0;
const DEFAULT_VIA = "whatsapp";

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

export const sendOtp = async ({ via } = {}) => {
  const ctx = getJsonCookie("otp_context");
  if (!ctx) throw new Error("OTP context missing");
  
  if (!ctx.country_code || !ctx.mobile_number) {
    throw new Error("Invalid OTP context - missing country_code or mobile_number");
  }

  const purpose =
    Number.isFinite(Number(ctx.purpose)) && String(ctx.purpose).trim() !== ""
      ? Number(ctx.purpose)
      : PURPOSE_SIGNUP_OR_LOGIN;

  const effectiveVia = String(via || ctx.via || DEFAULT_VIA).toLowerCase() === "sms" ? "sms" : "whatsapp";

  const basePayload = {
    identifier_type: IDENTIFIER_TYPE_MOBILE,
    country_code: String(ctx.country_code).trim(),
    mobile_number: String(ctx.mobile_number).trim(),
    purpose,
    via: effectiveVia,
    product_key: getDefaultProductKey(),
  };

  setJsonCookie(
    "otp_context",
    {
      ...ctx,
      via: effectiveVia,
    },
    { maxAge: 300, path: "/" }
  );

  console.log("sendOtp payload:", JSON.stringify(basePayload, null, 2));
  try {
    return await api.post("/otp/send-otp", basePayload);
  } catch (err) {
    if (isProductNotFoundError(err) && (await ensureLoginProduct())) {
      return api.post("/otp/send-otp", basePayload);
    }
    throw err;
  }
};

export const verifyOtp = async ({ otp }) => {
  const ctx = getJsonCookie("otp_context");
  if (!ctx) throw new Error("OTP context missing");
  
  if (!ctx.country_code || !ctx.mobile_number) {
    throw new Error("Invalid OTP context - missing country_code or mobile_number");
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

  console.log("[OTP Service] Verifying OTP:", JSON.stringify(verifyPayload, null, 2));
  let res;
  try {
    res = await api.post("/otp/verify-otp", verifyPayload);
  } catch (err) {
    if (isProductNotFoundError(err) && (await ensureLoginProduct())) {
      res = await api.post("/otp/verify-otp", verifyPayload);
    } else {
      throw err;
    }
  }
  
  const data = res.data;
  console.log("\n[OTP Service] OTP verification response received!");
  console.log("   Response status:", res.status);
  console.log("   Response object keys:", Object.keys(data || {}));
  console.log("   Full response body:", JSON.stringify(data, null, 2));
  
  console.log("\n   Response headers - checking for CSRF:");
  console.log("     x-csrf-token:", res.headers?.["x-csrf-token"] ? "FOUND" : "NOT FOUND");
  console.log("     csrf-token:", res.headers?.["csrf-token"] ? "FOUND" : "NOT FOUND");
  
  console.log("\n   Looking for tokens in response body:");
  console.log("     access_token:", data?.access_token ? `FOUND (len=${data.access_token.length})` : "NOT FOUND");
  console.log("     csrf_token:", data?.csrf_token ? `FOUND (len=${data.csrf_token.length})` : "NOT FOUND");
  console.log("     refresh_token:", data?.refresh_token ? `FOUND (len=${data.refresh_token.length})` : "NOT FOUND");

  // Try to extract tokens from all possible locations
  console.log("\n   Extracting and storing tokens...");
  
  // Store access token from response body
  if (data?.access_token) {
    console.log("\n   Storing access_token from response...");
    authStore.setAccessToken(data.access_token);
    console.log("     Access token stored");
  } else {
    console.error("     NO access_token in response body!");
    console.error("     This means the backend is NOT returning the token");
  }

  // Store refresh token from response body (if returned)
  if (data?.refresh_token) {
    console.log("\n   Storing refresh_token from response...");
    authStore.setRefreshToken(data.refresh_token);
    console.log("     Refresh token stored");
  } else {
    console.warn("     No refresh_token in response (may be HttpOnly only)");
  }

  // Try to get CSRF from all possible sources
  console.log("\n    Searching for CSRF token...");
  let csrfToken = null;
  
  // Source 1: Response body
  if (data?.csrf_token) {
    csrfToken = data.csrf_token;
    console.log("     Found in response.data.csrf_token (len=" + csrfToken.length + ")");
  }
  
  // Source 2: Response headers - lowercase
  if (!csrfToken && res.headers?.["x-csrf-token"]) {
    csrfToken = res.headers["x-csrf-token"];
    console.log("     Found in response.headers['x-csrf-token']");
  }
  
  // Source 3: Response headers - alternate
  if (!csrfToken && res.headers?.["csrf-token"]) {
    csrfToken = res.headers["csrf-token"];
    console.log("     Found in response.headers['csrf-token']");
  }
  
  if (csrfToken) {
    console.log("\n   CSRF token extracted! Storing now...");
    console.log("     Token length:", csrfToken.length);
    console.log("     First 30 chars:", csrfToken.substring(0, 30) + "...");
    authStore.setCsrfToken(csrfToken);
    console.log("     CSRF token stored in authStore");
  } else {
    console.error("\n   WARNING: No CSRF token found anywhere!");
    console.error("      - Not in response.data.csrf_token");
    console.error("      - Not in response.headers");
    console.error("      Response headers:", Object.keys(res.headers || {}));
    console.error("      If backend should be sending CSRF, check backend response");
  }

  // START 6-HOUR SESSION IMMEDIATELY ON OTP VERIFY
  console.log("\n   Starting 6-hour session...");
  authStore.setSessionStartTime();
  console.log("     Session started - 6 hour countdown begun");

  // Check if session was created (existing user)
  const isExistingUser = data?.is_existing_user === true || data?.user_exists === true;
  console.log("     User type: " + (isExistingUser ? "EXISTING USER" : "NEW USER"));
  
  console.log("\n[OTP Service] OTP verification complete!");

  return res;
};
