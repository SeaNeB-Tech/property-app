"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { getAuthLoginUrl } from "@/lib/core/appUrls";

const AUTH_GRACE_MS = 5000;
const AUTH_RETRY_GRACE_MS = 12000;

// NOTE: we avoid peeking at `document.cookie` here. Relying on client-visible
// cookies is brittle (httpOnly cookies are invisible to JS) and leads to race
// conditions and redirect loops. Use server-side session hints instead.

export default function RequireAuth({
  children,
  redirectTo = "/auth/login",
  fallback = (
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
  ),
} = {}) {
  const router = useRouter();
  const { authInitialized, isAuthenticated, isLoading, restoreSession } = useAuth();
  const [redirectReady, setRedirectReady] = useState(false);
  const [sessionHint, setSessionHint] = useState({
    checked: false,
    hasRefresh: false,
  });
  const retryRestoreRef = useRef(false);

  useEffect(() => {
    let active = true;

    if (!authInitialized || isLoading || isAuthenticated) {
      setRedirectReady(false);
      setSessionHint({ checked: false, hasRefresh: false });
      retryRestoreRef.current = false;
      return () => {
        active = false;
      };
    }

    const checkSessionHint = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        const hasRefresh = Boolean(payload?.hasRefreshSession);
        setSessionHint({ checked: true, hasRefresh });

        if (hasRefresh && !retryRestoreRef.current) {
          retryRestoreRef.current = true;
          await restoreSession?.();
        }
      } catch {
        if (!active) return;
        setSessionHint({ checked: true, hasRefresh: false });
      }
    };

    void checkSessionHint();

    return () => {
      active = false;
    };
  }, [authInitialized, isAuthenticated, isLoading, restoreSession]);

  useEffect(() => {
    if (!redirectReady) return;
    if (!authInitialized || isLoading || isAuthenticated) return;

    const fallbackTarget = String(redirectTo || "/auth/login");

    if (fallbackTarget === "/auth/login" && typeof window !== "undefined") {
      router.replace(
        getAuthLoginUrl({
          returnTo: window.location.href,
          source: "main-app",
        })
      );
      return;
    }

    router.replace(fallbackTarget);
  }, [authInitialized, isAuthenticated, isLoading, redirectReady, redirectTo, router]);

  useEffect(() => {
    if (!authInitialized || isLoading || isAuthenticated) return;

    if (!sessionHint.checked) return;
    if (sessionHint.hasRefresh) {
      const timer = setTimeout(() => {
        setRedirectReady(true);
      }, AUTH_RETRY_GRACE_MS);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setRedirectReady(true);
    }, AUTH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [authInitialized, isAuthenticated, isLoading, sessionHint.checked, sessionHint.hasRefresh]);

  if (!authInitialized || isLoading) return fallback;
  if (!isAuthenticated) return fallback;
  return children;
}

