import { getAuthAppUrl } from "@/lib/core/appUrls";

export default function robots() {
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
    host: getAuthAppUrl("/"),
  };
}

