import { removeCookie } from "./cookie";
import { authStore } from "@/app/auth/auth-service/store/authStore";

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
};
