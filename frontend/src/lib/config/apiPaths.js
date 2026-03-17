import { API_BASE_URL } from "@/lib/core/apiBaseUrl";

const API_BASE = String(API_BASE_URL || "").trim().replace(/\/+$/, "") || "/api";

export const API = {
  PROFILE: `${API_BASE}/auth/me`,
};
