"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { hydrateAuthSession } from "@/lib/api/client";

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

  if (source.startsWith("/") && !source.startsWith("//")) {
    return source;
  }

  try {
    const parsed = new URL(source);

    if (!/^https?:$/i.test(parsed.protocol)) {
      return "/dashboard";
    }

    if (
      ALLOWED_SOURCE_ORIGINS.length &&
      !ALLOWED_SOURCE_ORIGINS.includes(parsed.origin)
    ) {
      return "/dashboard";
    }

    return parsed.toString();
  } catch {
    return "/dashboard";
  }
};

const redirectToSource = (source) => {
  const target = String(source || "").trim() || "/dashboard";

  if (/^https?:\/\//i.test(target)) {
    window.location.replace(target);
    return;
  }

  window.location.replace(target);
};

export default function SsoCallbackContent() {
  const params = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      const bridgeToken = params.get("bridge_token");
      const source = resolveSafeSource(params.get("source"));

      if (!bridgeToken) {
        redirectToSource(source);
        return;
      }

      try {
        const res = await fetch("/api/auth/exchange-bridge-token", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bridge_token: bridgeToken,
            target_product_key:
              String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim() ||
              "property",
          }),
        });

        if (!res.ok) {
          redirectToSource(source);
          return;
        }

        try {
          const payload = await res.clone().json();

          const accessToken = String(
            payload?.accessToken ||
              payload?.access_token ||
              payload?.data?.accessToken ||
              payload?.data?.access_token ||
              ""
          ).trim();

          const csrfToken = String(
            payload?.csrfToken ||
              payload?.csrf_token ||
              payload?.data?.csrfToken ||
              payload?.data?.csrf_token ||
              ""
          ).trim();

          if (accessToken || csrfToken) {
            hydrateAuthSession({ accessToken, csrfToken, broadcast: true });
          }
        } catch {
          // payload may be non-JSON; rely on cookie session
        }

        if (cancelled) return;

        await new Promise((resolve) => setTimeout(resolve, 80));

        redirectToSource(source);
      } catch {
        redirectToSource(source);
      }
    }

    exchange();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
