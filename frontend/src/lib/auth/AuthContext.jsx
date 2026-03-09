"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, refreshSession, setAuthFailureHandler } from "@/lib/auth/apiClient";
import { API } from "@/lib/config/apiPaths";
import { notifyAuthChanged, subscribeAuthState } from "@/services/auth.service";

const AuthContext = createContext(null);
const PUBLIC_AUTH_PATHS = new Set([
  "/auth/login",
  "/auth/otp",
  "/auth/email-otp",
  "/auth/complete-profile",
  "/auth/business-register",
  "/auth/business-option",
  "/auth/home",
  "/auth/success",
]);

const hasAuthCookieHints = () => {
  if (typeof document === "undefined") return false;
  const cookieSource = String(document.cookie || "");
  return (
    cookieSource.includes("refresh_token_property=") ||
    cookieSource.includes("csrf_token_property=") ||
    cookieSource.includes("post_otp_verified=") ||
    cookieSource.includes("signup_otp_verified=")
  );
};

const shouldSkipPublicAuthProbe = () => {
  if (typeof window === "undefined") return false;
  const path = String(window.location.pathname || "").trim();
  return PUBLIC_AUTH_PATHS.has(path) && !hasAuthCookieHints();
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("logged_out");
  const [user, setUser] = useState(null);

  const applyUserProfile = useCallback((profile) => {
    const nextUser = profile?.data || profile?.user || profile || null;
    if (nextUser) {
      setUser(nextUser);
      setStatus("authenticated");
      return true;
    }
    setUser(null);
    setStatus("logged_out");
    return false;
  }, []);

  const restoreSession = useCallback(async () => {
    if (shouldSkipPublicAuthProbe()) {
      setUser(null);
      setStatus("logged_out");
      return false;
    }

    setStatus("restoring");

    const fetchProfile = async () =>
      fetch(API.PROFILE, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

    try {
      let response = await fetchProfile();
      if (!response.ok && [401, 403].includes(Number(response.status || 0))) {
        const refreshed = await refreshSession();
        if (refreshed) {
          response = await fetchProfile();
        }
      }

      if (!response.ok) {
        setUser(null);
        setStatus("logged_out");
        return false;
      }
      const profile = await response.json();
      return applyUserProfile(profile);
    } catch {
      setUser(null);
      setStatus("logged_out");
      return false;
    }
  }, [applyUserProfile]);

  const logout = useCallback(async ({ redirect } = { redirect: false }) => {
    let canClearClientState = false;
    try {
      await authApi.logout();
      canClearClientState = true;
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status === 401 || status === 403) {
        canClearClientState = true;
      } else {
        return;
      }
    }

    if (!canClearClientState) return;
    setUser(null);
    setStatus("logged_out");

    if (redirect && typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  const login = useCallback(async (credentials) => {
    await authApi.login(credentials || {});
    const response = await fetch(API.PROFILE, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const profile = response.ok ? await response.json() : null;
    const userProfile = profile?.data || profile?.user || profile || null;
    applyUserProfile(userProfile);
    notifyAuthChanged();
    return userProfile;
  }, [applyUserProfile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restoreSession();
    return subscribeAuthState(() => {
      void restoreSession();
    });
  }, [restoreSession]);

  useEffect(() => {
    if (typeof window === "undefined") return () => {};
    const onFocus = () => {
      void restoreSession();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [restoreSession]);

  useEffect(() => {
    setAuthFailureHandler(async () => {
      await logout({ redirect: false });
    });

    return () => {
      setAuthFailureHandler(null);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      status,
      isRestoring: status === "restoring",
      isAuthenticated: status === "authenticated",
      login,
      restoreSession,
      logout,
      applyUserProfile,
    }),
    [user, status, login, restoreSession, logout, applyUserProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
