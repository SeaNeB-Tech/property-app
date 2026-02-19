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

export const clearPanelAuthSession = () => {
  authStore.clearAll();
  PANEL_AUTH_COOKIE_KEYS.forEach((key) => removeCookie(key));
};
