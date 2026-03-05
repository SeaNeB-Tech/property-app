"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const resolveSafeSource = (value) => {
  const source = String(value || "").trim();
  if (!source) return "/dashboard";
  if (!source.startsWith("/") || source.startsWith("//")) return "/dashboard";
  return source;
};

export default function SsoCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    async function exchange() {
      const bridgeToken = params.get("bridge_token");
      const source = resolveSafeSource(params.get("source"));

      if (!bridgeToken) {
        router.replace(source);
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
        router.replace(source);
        return;
      }

      router.replace(source);
    }

    void exchange();
  }, [params, router]);

  return null;
}
