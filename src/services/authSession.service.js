import { removeCookie } from "./cookie";
import { authStore } from "@/app/auth/auth-service/store/authStore";
import api from "@/services/api";

const PANEL_AUTH_COOKIE_KEYS = [
  "access_token",
  "refresh_token",
  "access_token_issued_time",
  "csrf_token",
  "csrf-token",
  "XSRF-TOKEN",
  "xsrf-token",
  "_csrf",
  "session_start_time",
  "profile_completed",
  "mobile_verified",
  "otp_mobile",
  "otp_cc",
  "otp_context",
  "email_otp_until",
  "mobile_otp_until",
  "business_mobile_otp_until",
  "reg_form_draft",
  "verified_email",
  "verified_business_email",
  "verified_mobile",
  "verified_business_mobile",
  "verified_pan",
  "verified_gstin",
  "business_registered",
  "business_name",
  "business_type",
  "business_location",
  "business_id",
  "branch_id",
  "dashboard_mode",
  "product_key",
];

const STORAGE_KEYS = [
  "access_token",
  "refresh_token",
  "csrf_token",
  "csrf-token",
  "session_start_time",
  "profile_completed",
  "product_key",
];

const getCookieKeys = () => {
  if (typeof document === "undefined") return [];
  const pairs = document.cookie ? document.cookie.split("; ") : [];
  return pairs
    .map((pair) => {
      const idx = pair.indexOf("=");
      if (idx < 0) return "";
      return decodeURIComponent(pair.slice(0, idx));
    })
    .filter(Boolean);
};

export const clearPanelAuthSession = () => {
  authStore.clearAll();
  PANEL_AUTH_COOKIE_KEYS.forEach((key) => removeCookie(key));
  getCookieKeys()
    .filter((key) => {
      const lower = String(key || "").toLowerCase();
      return (
        lower.startsWith("access_token_") ||
        lower.startsWith("refresh_token_") ||
        lower.startsWith("csrf_token_") ||
        lower.startsWith("csrf-token_") ||
        lower.startsWith("xsrf-token_")
      );
    })
    .forEach((key) => removeCookie(key));
  if (typeof window !== "undefined") {
    STORAGE_KEYS.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {}
      try {
        window.sessionStorage.removeItem(key);
      } catch {}
    });
  }
};

export const logoutPanelSession = async () => {
  clearPanelAuthSession();
  try {
    await api.post("/auth/logout", {}, { withCredentials: true });
  } catch {
    // Continue with local cleanup.
  } finally {
    clearPanelAuthSession();
  }
};
