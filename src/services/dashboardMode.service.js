import { getCookie, setCookie } from "./cookie";

export const DASHBOARD_MODE_USER = "user";
export const DASHBOARD_MODE_BUSINESS = "business";

const DASHBOARD_MODE_COOKIE = "dashboard_mode";
const BUSINESS_REGISTERED_COOKIE = "business_registered";

export const getDashboardMode = () => {
  const mode = String(getCookie(DASHBOARD_MODE_COOKIE) || "").trim().toLowerCase();
  if (mode === DASHBOARD_MODE_BUSINESS) return DASHBOARD_MODE_BUSINESS;
  return DASHBOARD_MODE_USER;
};

export const setDashboardMode = (mode) => {
  const safeMode = mode === DASHBOARD_MODE_BUSINESS ? DASHBOARD_MODE_BUSINESS : DASHBOARD_MODE_USER;
  setCookie(DASHBOARD_MODE_COOKIE, safeMode, { maxAge: 60 * 60 * 24 * 30, path: "/" });
  return safeMode;
};

export const isBusinessRegistered = () => getCookie(BUSINESS_REGISTERED_COOKIE) === "true";

