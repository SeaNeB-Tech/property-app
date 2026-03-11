"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { getAuthLoginUrl } from "@/lib/core/appUrls";

const AUTH_GRACE_MS = 5000;

// NOTE: we avoid peeking at `document.cookie` here. Relying on client-visible
// cookies is brittle (httpOnly cookies are invisible to JS) and leads to race
// conditions and redirect loops. Instead, call `restoreSession()` once and
// let the server-side session hint endpoints determine refresh availability.

export default function RequireAuth({
  children,
  redirectTo = "/auth/login",
  fallback = (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
      Preparing session...
    </div>
  ),
} = {}) {
  const router = useRouter();
  const { authInitialized, isAuthenticated, isLoading, restoreSession } = useAuth();
  const [attemptedRestore, setAttemptedRestore] = useState(false);

  useEffect(() => {
    if (!authInitialized || isLoading) return;
    if (isAuthenticated) return;
    if (attemptedRestore) return;

    setAttemptedRestore(true);

    const tryRestore = async () => {
      // Try restoring session once. If it fails, redirect to login preserving
      // a returnTo param so the user can come back after authenticating.
      const restored = await restoreSession?.();
      if (restored) return;

      const fallback = String(redirectTo || "/auth/login");

      if (fallback === "/auth/login" && typeof window !== "undefined") {
        router.replace(
          getAuthLoginUrl({
            returnTo: window.location.href,
            source: "main-app",
          })
        );
        return;
      }

      router.replace(fallback);
    };

    void tryRestore();
  }, [authInitialized, isAuthenticated, isLoading, redirectTo, router, restoreSession, attemptedRestore]);

  if (!authInitialized || isLoading) return fallback;
  if (!isAuthenticated) return fallback;
  return children;
}

