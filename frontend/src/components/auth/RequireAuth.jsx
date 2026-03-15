"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSessionHint } from "@/lib/auth/sessionHint";
import { getAuthLoginUrl } from "@/lib/core/appUrls";

const AUTH_GRACE_MS = 5000;
const AUTH_RETRY_GRACE_MS = 12000;

const DEFAULT_FALLBACK = (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className="flex min-h-screen items-center justify-center bg-slate-50"
  >
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 text-center shadow-sm">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
      <p className="text-sm text-slate-500">Preparing session...</p>
    </div>
  </div>
);

// NOTE: we avoid peeking at `document.cookie` here. Relying on client-visible
// cookies is brittle (httpOnly cookies are invisible to JS) and leads to race
// conditions and redirect loops. Use server-side session hints instead.

export default function RequireAuth({
  children,
  redirectTo = "/auth/login",
  fallback = DEFAULT_FALLBACK,
} = {}) {
  const router = useRouter();
  const { authInitialized, isAuthenticated, isLoading, restoreSession } = useAuth();
  const [redirectReady, setRedirectReady] = useState(false);
  const [sessionHint, setSessionHint] = useState({
    checked: false,
    hasRefresh: false,
    hasCsrf: false,
  });
  const retryRestoreRef = useRef(false);
  const setSessionHintSafe = useCallback((nextHint) => {
    setSessionHint((prev) => {
      if (
        prev.checked === nextHint.checked &&
        prev.hasRefresh === nextHint.hasRefresh &&
        prev.hasCsrf === nextHint.hasCsrf
      ) {
        return prev;
      }
      return nextHint;
    });
  }, []);

  useEffect(() => {
    let active = true;

    if (!authInitialized || isLoading || isAuthenticated) {
      setRedirectReady(false);
      setSessionHintSafe({ checked: false, hasRefresh: false, hasCsrf: false });
      retryRestoreRef.current = false;
      return () => {
        active = false;
      };
    }

    const checkSessionHint = async () => {
      try {
        const payload = await getSessionHint();
        if (!active) return;
        const hasRefresh = Boolean(payload?.hasRefreshSession);
        const hasCsrf = Boolean(payload?.hasCsrfCookie);
        setSessionHintSafe({ checked: true, hasRefresh, hasCsrf });

        if ((hasRefresh || hasCsrf) && !retryRestoreRef.current) {
          retryRestoreRef.current = true;
          await restoreSession?.();
        }
      } catch {
        if (!active) return;
        setSessionHintSafe({ checked: true, hasRefresh: false, hasCsrf: false });
      }
    };

    void checkSessionHint();

    return () => {
      active = false;
    };
  }, [authInitialized, isAuthenticated, isLoading, restoreSession, setSessionHintSafe]);

  useEffect(() => {
    if (!redirectReady) return;
    if (!authInitialized || isLoading || isAuthenticated) return;

    const fallbackTarget = String(redirectTo || "/auth/login");

    if (fallbackTarget === "/auth/login" && typeof window !== "undefined") {
      const loginUrl = getAuthLoginUrl({
        returnTo: window.location.href,
        source: "main-app",
      });
      if (/^https?:\/\//i.test(loginUrl)) {
        window.location.href = loginUrl;
      } else {
        router.replace(loginUrl);
      }
      return;
    }

    router.replace(fallbackTarget);
  }, [authInitialized, isAuthenticated, isLoading, redirectReady, redirectTo, router]);

  useEffect(() => {
    if (!authInitialized || isLoading || isAuthenticated) return;

    if (!sessionHint.checked) return;
    if (sessionHint.hasRefresh || sessionHint.hasCsrf) {
      const timer = setTimeout(() => {
        setRedirectReady(true);
      }, AUTH_RETRY_GRACE_MS);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setRedirectReady(true);
    }, AUTH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [
    authInitialized,
    isAuthenticated,
    isLoading,
    sessionHint.checked,
    sessionHint.hasRefresh,
    sessionHint.hasCsrf,
  ]);

  if (!authInitialized || isLoading) return fallback;
  if (!isAuthenticated) return fallback;
  return children;
}

