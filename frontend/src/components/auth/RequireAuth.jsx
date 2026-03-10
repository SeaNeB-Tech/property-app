"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";

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
  const { authInitialized, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!authInitialized || isLoading) return;
    if (isAuthenticated) return;
    router.replace(String(redirectTo || "/auth/login"));
  }, [authInitialized, isAuthenticated, isLoading, redirectTo, router]);

  if (!authInitialized || isLoading) return fallback;
  if (!isAuthenticated) return fallback;
  return children;
}

