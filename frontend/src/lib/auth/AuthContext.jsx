"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, setAuthFailureHandler } from "@/lib/auth/apiClient";
import { API } from "@/lib/config/apiPaths";
import { notifyAuthChanged, subscribeAuthState } from "@/services/auth.service";
import { getAccessToken, getCsrfToken } from "@/lib/auth/tokenStorage";
import { hydrateAuthSession } from "@/lib/api/client";
import { ensureSessionReady } from "@/app/auth/auth-service/auth.bootstrap";
import { clearSessionHintCache } from "@/lib/auth/sessionHint";
import { clearRefreshBudget } from "@/lib/auth/refreshBudget";

const AuthContext = createContext(null);

const AUTH_PROBE_FAILURE_COOLDOWN_MS = 5000;

let inFlightRestoreSessionPromise = null;
let lastAuthProbeFailureAt = 0;

const buildAuthProbeHeaders = () => {
  const headers = new Headers();

  const accessToken = String(getAccessToken() || "").trim();
  const csrfToken = String(getCsrfToken() || "").trim();

  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  if (csrfToken) {
    headers.set("x-csrf-token", csrfToken);
    headers.set("x-xsrf-token", csrfToken);
    headers.set("csrf-token", csrfToken);
  }

  return headers;
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("logged_out");
  const [user, setUser] = useState(null);
  const [isReady, setIsReady] = useState(false);

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

  const restoreSession = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();

    if (
      lastAuthProbeFailureAt &&
      now - lastAuthProbeFailureAt < AUTH_PROBE_FAILURE_COOLDOWN_MS &&
      !force
    ) {
      setUser(null);
      setStatus("logged_out");
      return false;
    }

    if (inFlightRestoreSessionPromise) {
      return inFlightRestoreSessionPromise;
    }

    const runRestore = async () => {
      try {
        setStatus("restoring");

        // Single-flight bootstrap: ensure refresh-cookie session is converted into a usable
        // access token/CSRF memory state before probing /me.
        const sessionOk = await ensureSessionReady({ force });
        if (!sessionOk) {
          lastAuthProbeFailureAt = Date.now();
          setUser(null);
          setStatus("logged_out");
          return false;
        }

        const fetchProfile = async () =>
          fetch(API.PROFILE, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: buildAuthProbeHeaders(),
          });

        let response = await fetchProfile();

        if (!response.ok && [401, 403].includes(Number(response.status))) {
          const refreshed = await ensureSessionReady({ force: true });
          if (refreshed) {
            response = await fetchProfile();
          }
        }

        if (!response.ok) {
          lastAuthProbeFailureAt = Date.now();
          setUser(null);
          setStatus("logged_out");
          return false;
        }

        const profile = await response.json();
        hydrateAuthSession({
          accessToken: getAccessToken(),
          csrfToken: getCsrfToken(),
          broadcast: false,
        });

        lastAuthProbeFailureAt = 0;
        const didApply = applyUserProfile(profile);
        if (didApply) {
          clearRefreshBudget();
        }
        return didApply;
      } catch {
        lastAuthProbeFailureAt = Date.now();
        setUser(null);
        setStatus("logged_out");
        return false;
      } finally {
        setIsReady(true);
      }
    };

    inFlightRestoreSessionPromise = runRestore().finally(() => {
      inFlightRestoreSessionPromise = null;
    });

    return inFlightRestoreSessionPromise;
  }, [applyUserProfile]);

  const logout = useCallback(async ({ redirect } = { redirect: false }) => {
    try {
      await authApi.logout();
    } catch {}

    clearRefreshBudget();
    clearSessionHintCache();
    setUser(null);
    setStatus("logged_out");

    if (redirect && typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  const login = useCallback(async (credentials) => {
    await authApi.login(credentials || {});
    clearRefreshBudget();
    clearSessionHintCache();
    const success = await restoreSession({ force: true });

    if (success) {
      notifyAuthChanged({ force: true });
    }

    return success;
  }, [restoreSession]);

  useEffect(() => {
    let isMounted = true;

    const runRestore = () => {
      if (!isMounted) return;
      void restoreSession();
    };

    runRestore();

    const unsubscribe = subscribeAuthState((event) => {
      if (!isMounted) return;
      const shouldForce = event?.detail?.force === true;
      void restoreSession({ force: shouldForce });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [restoreSession]);

  useEffect(() => {
    setAuthFailureHandler(async () => {
      await logout({ redirect: false });
    });

    return () => setAuthFailureHandler(null);
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      status,
      isReady,
      isRestoring: status === "restoring",
      isAuthenticated: status === "authenticated",
      authInitialized: isReady,
      isLoading: !isReady || status === "restoring",
      login,
      restoreSession,
      logout,
      applyUserProfile,
    }),
    [user, status, isReady, login, restoreSession, logout, applyUserProfile]
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
