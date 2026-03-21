"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSessionHint } from "@/lib/auth/sessionHint";
import { getAuthLoginUrl } from "@/lib/core/appUrls";

const AUTH_RECOVERY_RETRY_MS = 600;
const AUTH_RECOVERY_MAX_MS = 20000;
const AUTH_HINT_FAILURE_LIMIT = 2;

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
  const [retryTick, setRetryTick] = useState(0);
  const retryRef = useRef({ attempts: 0, hintFailures: 0, startedAt: 0, timer: null });
  const redirectingRef = useRef(false);

  useEffect(() => {
    let active = true;

    const clearTimer = () => {
      if (retryRef.current.timer) {
        clearTimeout(retryRef.current.timer);
        retryRef.current.timer = null;
      }
    };

    if (!authInitialized || isLoading || isAuthenticated) {
      clearTimer();
      redirectingRef.current = false;
      retryRef.current = { attempts: 0, hintFailures: 0, startedAt: 0, timer: null };
      return () => {
        active = false;
      };
    }

    const scheduleRetry = () => {
      if (!active) return;
      clearTimer();
      retryRef.current.timer = setTimeout(() => {
        retryRef.current.timer = null;
        setRetryTick((value) => value + 1);
      }, AUTH_RECOVERY_RETRY_MS);
    };

    const attemptRestore = async () => {
      try {
        return await restoreSession?.({ force: true });
      } catch {
        return false;
      }
    };

    const redirectNow = () => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;

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
    };

    const checkSessionHint = async () => {
      if (!retryRef.current.startedAt) {
        retryRef.current.startedAt = Date.now();
      }

      let payload = null;
      try {
        payload = await getSessionHint({ force: true });
      } catch {
        payload = null;
      }

      if (!active) return;

      const hasRefresh = Boolean(payload?.hasRefreshSession);
      if (payload) {
        retryRef.current.hintFailures = 0;
      } else {
        retryRef.current.hintFailures += 1;
      }

      const elapsed = Date.now() - retryRef.current.startedAt;
      const canKeepTrying = elapsed < AUTH_RECOVERY_MAX_MS;

      if (hasRefresh) {
        const restored = await attemptRestore();
        if (!active) return;
        if (restored) return;
        if (canKeepTrying) {
          scheduleRetry();
          return;
        }
        redirectNow();
        return;
      }

      if (!payload) {
        const restored = await attemptRestore();
        if (!active) return;
        if (restored) return;
        if (retryRef.current.hintFailures <= AUTH_HINT_FAILURE_LIMIT && canKeepTrying) {
          scheduleRetry();
          return;
        }
      }

      redirectNow();
    };

    void checkSessionHint();

    return () => {
      active = false;
      clearTimer();
    };
  }, [authInitialized, isAuthenticated, isLoading, redirectTo, restoreSession, retryTick, router]);

  if (!authInitialized || isLoading) return fallback;
  if (!isAuthenticated) return fallback;
  return children;
}

