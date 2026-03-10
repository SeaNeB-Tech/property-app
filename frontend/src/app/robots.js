import { getAuthAppUrl } from "@/lib/core/appUrls";

const tryParseUrl = (value) => {
  try {
    return new URL(String(value || "").trim());
  } catch {
    return null;
  }
};

export default function robots() {
  const hostUrl = tryParseUrl(getAuthAppUrl("/"))?.toString() || "";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/auth/login",
        "/auth/otp",
        "/auth/email-otp",
        "/auth/complete-profile",
        "/auth/business-register",
        "/auth/business-option",
        "/dashboard",
        "/dashboard/*",
        "/account",
        "/account/*",
      ],
    },
    ...(hostUrl ? { host: hostUrl } : {}),
  };
}

