"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { hydrateAuthSession } from "@/lib/api/client";
import { getAllowedReturnOrigins, getPrimaryListingOrigin } from "@/lib/postLoginRedirect";
import { clearAuthFailureArtifacts, shouldClearAuthOnError } from "@/services/auth.service";
import { API_BASE_URL } from "@/lib/core/apiBaseUrl";

const AUTH_SSO_RESULT_KEY = "seaneb_sso_exchange_result";
const AUTH_SSO_MESSAGE_TYPE = "seaneb:sso:exchange";
const SSO_TOKEN_ONCE_KEY = "seaneb_sso_bridge_token_used";

const LISTING_APP_ORIGIN = getPrimaryListingOrigin();
const ALLOWED_SOURCE_ORIGINS = getAllowedReturnOrigins();

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

const shouldBlockCallbackLoop = (target) => {
  const value = String(target || "").trim();
  if (!value) return false;
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value === "/auth/sso/callback";
  }
  try {
    const parsed = new URL(value);
    return parsed.pathname === "/auth/sso/callback";
  } catch {
    return false;
  }
};

const normalizeSafeSource = (value) => {
  const safe = resolveSafeSource(value);
  if (shouldBlockCallbackLoop(safe)) return "/dashboard";
  return safe;
};

const publishSsoResult = ({ ok, source, error = "" }) => {
  const payload = {
    type: AUTH_SSO_MESSAGE_TYPE,
    ok: Boolean(ok),
    source: String(source || "").trim(),
    error: String(error || "").trim(),
    at: Date.now(),
  };

  try {
    window.localStorage.setItem(AUTH_SSO_RESULT_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch {
    // ignore postMessage errors
  }
};

export default function SsoCallbackContent() {
  const params = useSearchParams();
  const hasHandledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      if (hasHandledRef.current) return;
      hasHandledRef.current = true;

      const bridgeToken = params.get("bridge_token");
      const source = normalizeSafeSource(params.get("source"));

      if (!bridgeToken) {
        publishSsoResult({ ok: false, source, error: "bridge_token missing in callback URL" });
        redirectToSource(source);
        return;
      }

      try {
        if (typeof window !== "undefined") {
          const prev = window.sessionStorage.getItem(SSO_TOKEN_ONCE_KEY);
          if (prev && prev === bridgeToken) {
            publishSsoResult({ ok: true, source });
            redirectToSource(source);
            return;
          }
          window.sessionStorage.setItem(SSO_TOKEN_ONCE_KEY, bridgeToken);
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("bridge_token");
          nextUrl.searchParams.delete("bridgeToken");
          window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        }
      } catch {
        // ignore storage/history failures
      }

      try {
        const apiBase = String(API_BASE_URL || "").trim().replace(/\/+$/, "") || "/api";
        const res = await fetch(`${apiBase}/auth/exchange-bridge-token`, {
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

        let payload = {};
        try {
          payload = await res.clone().json();
        } catch {
          payload = {};
        }

        if (!res.ok) {
          const status = Number(res.status || 0);
          const code = String(payload?.error?.code || payload?.code || "").trim();
          const isReplay =
            status === 409 ||
            code === "BRIDGE_TOKEN_REPLAYED" ||
            /replay/i.test(String(payload?.error?.message || payload?.message || ""));

          if (isReplay) {
            try {
              const me = await fetch(`${apiBase}/auth/me`, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
              });
              if (me.ok) {
                publishSsoResult({ ok: true, source });
                redirectToSource(source);
                return;
              }
            } catch {
              // fall through to error handling
            }
          }
          if (shouldClearAuthOnError({ status: res.status, data: payload })) {
            clearAuthFailureArtifacts();
          }
          publishSsoResult({ ok: false, source, error: "Bridge exchange failed" });
          redirectToSource(source);
          return;
        }

        try {
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

        publishSsoResult({ ok: true, source });

        if (window.opener && !window.opener.closed) {
          try {
            const openerTarget = String(source || "").trim();
            if (openerTarget.startsWith("/") && LISTING_APP_ORIGIN) {
              window.opener.location.href = new URL(openerTarget, LISTING_APP_ORIGIN).toString();
            } else if (/^https?:\/\//i.test(openerTarget)) {
              window.opener.location.href = openerTarget;
            }
          } catch {
            // fall through to redirect
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 80));

        redirectToSource(source);
      } catch {
        publishSsoResult({ ok: false, source, error: "Bridge exchange failed" });
        redirectToSource(source);
      }
    }

    exchange();

    return () => {
      cancelled = true;
    };
  }, [params]);

  return null;
}
