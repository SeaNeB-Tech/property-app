"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { getAuthLoginUrl } from "@/lib/core/appUrls";

const AUTH_GRACE_MS = 5000;
const AUTH_RETRY_INTERVAL_MS = 500;

const hasAuthCookies = () => {
  if (typeof document === "undefined") return false;
  const source = String(document.cookie || "").toLowerCase();
  return source.includes("csrf_token_property=") || source.includes("refresh_token_property=");
};

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
  const [retrying, setRetrying] = useState(false);
  const graceTimerRef = useRef(null);
  const retryIntervalRef = useRef(null);

  useEffect(() => {
    if (!authInitialized || isLoading) return;
    if (isAuthenticated) return;
    if (retrying) return;

    setRetrying(true);
    const tryRestore = async () => {
      const restored = await restoreSession?.();
      if (restored) return;
      const fallback = String(redirectTo || "/auth/login");

      if (hasAuthCookies()) {
        const start = Date.now();
        retryIntervalRef.current = setInterval(async () => {
          const retried = await restoreSession?.();
          if (retried) {
            if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
            return;
          }

          if (Date.now() - start < AUTH_GRACE_MS) return;

          if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;

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
        }, AUTH_RETRY_INTERVAL_MS);
        return;
      }

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
  }, [authInitialized, isAuthenticated, isLoading, redirectTo, router, restoreSession, retrying]);

  useEffect(() => {
    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
    };
  }, []);

  if (!authInitialized || isLoading) return fallback;
  if (!isAuthenticated) return fallback;
  return children;
}

