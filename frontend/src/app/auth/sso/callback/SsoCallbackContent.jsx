"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LISTING_APP_ORIGIN = (() => {
  try {
    return new URL(String(process.env.NEXT_PUBLIC_APP_URL || "").trim()).origin;
  } catch {
    return "";
  }
})();

const ALLOWED_SOURCE_ORIGINS = Array.from(
  new Set(
    String(process.env.NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS || "")
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .concat(LISTING_APP_ORIGIN ? [LISTING_APP_ORIGIN] : [])
  )
);

const resolveSafeSource = (value) => {
  const source = String(value || "").trim();
  if (!source) return "/dashboard";
  if (source.startsWith("/") && !source.startsWith("//")) return source;

  try {
    const parsed = new URL(source);
    if (!/^https?:$/i.test(parsed.protocol)) return "/dashboard";
    if (ALLOWED_SOURCE_ORIGINS.length && !ALLOWED_SOURCE_ORIGINS.includes(parsed.origin)) {
      return "/dashboard";
    }
    return parsed.toString();
  } catch {
    return "/dashboard";
  }
};

const redirectToSource = (router, source) => {
  const target = String(source || "").trim() || "/dashboard";
  if (/^https?:\/\//i.test(target)) {
    window.location.replace(target);
    return;
  }
  router.replace(target);
};

export default function SsoCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    async function exchange() {
      const bridgeToken = params.get("bridge_token");
      const source = resolveSafeSource(params.get("source"));

      if (!bridgeToken) {
        redirectToSource(router, source);
        return;
      }

      const res = await fetch("/api/auth/exchange-bridge-token", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bridge_token: bridgeToken,
          target_product_key: process.env.NEXT_PUBLIC_PRODUCT_KEY,
        }),
      });

      if (!res.ok) {
        redirectToSource(router, source);
        return;
      }

      redirectToSource(router, source);
    }

    void exchange();
  }, [params, router]);

  return null;
}
