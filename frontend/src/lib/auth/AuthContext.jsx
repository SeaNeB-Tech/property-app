"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { authApi, setAuthFailureHandler } from "@/lib/auth/apiClient";
import { API } from "@/lib/config/apiPaths";
import { notifyAuthChanged, removeCookie, subscribeAuthState } from "@/services/auth.service";
import { clearAuthFlowContext } from "@/lib/auth/flowContext";
import { getAccessToken, getCsrfToken } from "@/lib/auth/tokenStorage";
import { hydrateAuthSession } from "@/lib/api/client";
import { ensureSessionReady } from "@/app/auth/auth-service/auth.bootstrap";
import { clearSessionHintCache } from "@/lib/auth/sessionHint";
import { clearRefreshBudget } from "@/lib/auth/refreshBudget";

const AuthContext = createContext(null);

const AUTH_PROBE_FAILURE_COOLDOWN_MS = 5000;

let inFlightRestoreSessionPromise = null;
let lastAuthProbeFailureAt = 0;

const readBearerTokenFromHeaders = (headers) => {
  const headerAuth = String(
    headers?.get?.("authorization") || headers?.get?.("Authorization") || ""
  ).trim();

  if (!headerAuth) return "";
  return /^Bearer\s+/i.test(headerAuth)
    ? headerAuth.replace(/^Bearer\s+/i, "").trim()
    : headerAuth;
};

const readCsrfTokenFromHeaders = (headers) =>
  String(
    headers?.get?.("x-csrf-token") ||
      headers?.get?.("x-xsrf-token") ||
      headers?.get?.("csrf-token") ||
      ""
  ).trim();

const hydrateSessionFromProfileResponse = (response) => {
  const accessToken = readBearerTokenFromHeaders(response?.headers);
  const csrfToken = readCsrfTokenFromHeaders(response?.headers);

  if (accessToken || csrfToken) {
    hydrateAuthSession({
      accessToken,
      csrfToken,
      broadcast: false,
    });
  }
};

const readProfilePayload = async (response) => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const isPanelAccessRestrictedPayload = (payload = null) => {
  const message = String(
    payload?.error?.message || payload?.message || ""
  ).trim();
  return /no active branch associated/i.test(message);
};

const isBusinessPanelRoute = (pathname = "") => {
  const safePath = String(pathname || "").trim();
  return (
    safePath.startsWith("/dashboard/broker") ||
    safePath.startsWith("/auth/business-register")
  );
};

const shouldTreatForbiddenProfileAsAuthenticated = ({
  pathname = "",
  payload = null,
} = {}) => {
  if (isPanelAccessRestrictedPayload(payload)) return true;
  if (!isBusinessPanelRoute(pathname)) return false;

  const code = String(payload?.error?.code || payload?.code || "").trim().toLowerCase();
  const message = String(payload?.error?.message || payload?.message || "").trim().toLowerCase();
  if (!code && !message) return true;

  return (
    code.includes("access_denied") ||
    code.includes("forbidden") ||
    message.includes("access denied") ||
    message.includes("forbidden") ||
    message.includes("branch") ||
    message.includes("business")
  );
};

const isLimitedAuthenticatedProfilePayload = (payload = null) => {
  const candidates = [
    payload,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;

    const limitedHints = [
      candidate?.auth_limited,
      candidate?.limited,
      candidate?.branch_required,
      candidate?.panel_access_restricted,
    ];
    const message = String(
      candidate?.error?.message || candidate?.message || ""
    ).trim();

    const hasLimitedFlag = limitedHints.some(
      (value) => value === true || String(value || "").trim().toLowerCase() === "true"
    );

    if (hasLimitedFlag || /no active branch associated/i.test(message)) {
      return true;
    }
  }

  return false;
};

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
  const pathname = usePathname();
  const [status, setStatus] = useState("logged_out");
  const [user, setUser] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const shouldSkipProfileRestore = String(pathname || "").startsWith("/auth/business-register");

  const applyUserProfile = useCallback((profile) => {
    if (isLimitedAuthenticatedProfilePayload(profile)) {
      setUser(null);
      setStatus("authenticated");
      return true;
    }

    const nextUser =
      profile?.data?.profile ||
      profile?.data?.user ||
      profile?.profile ||
      profile?.user ||
      profile?.data ||
      profile ||
      null;

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
        if (shouldSkipProfileRestore && !force) {
          lastAuthProbeFailureAt = 0;
          setIsReady(true);
          return false;
        }

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
          const payload = await readProfilePayload(response);
          if (
            Number(response.status || 0) === 403 &&
            shouldTreatForbiddenProfileAsAuthenticated({ pathname, payload })
          ) {
            hydrateSessionFromProfileResponse(response);
            lastAuthProbeFailureAt = 0;
            setUser(null);
            setStatus("authenticated");
            clearRefreshBudget();
            return true;
          }

          lastAuthProbeFailureAt = Date.now();
          setUser(null);
          setStatus("logged_out");
          return false;
        }

        hydrateSessionFromProfileResponse(response);

        const profile = await response.json();
        if (isLimitedAuthenticatedProfilePayload(profile)) {
          lastAuthProbeFailureAt = 0;
          setUser(null);
          setStatus("authenticated");
          clearRefreshBudget();
          return true;
        }
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
  }, [applyUserProfile, pathname, shouldSkipProfileRestore]);

  const logout = useCallback(async ({ redirect } = { redirect: false }) => {
    try {
      await authApi.logout();
    } catch {}

    clearRefreshBudget();
    clearSessionHintCache();
    clearAuthFlowContext();
    removeCookie("auth_return_to");
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
    let timer = null;

    const runRestore = () => {
      if (!isMounted) return;
      void restoreSession();
    };

    const isSsoCallback = () => {
      try {
        return (
          typeof window !== "undefined" &&
          new URL(window.location.href).searchParams.has("bridge_token")
        );
      } catch {
        return false;
      }
    };

    // Debounce initial restore on mount to avoid refresh-token rotation conflicts
    // when users spam page refresh (F5). If the page unloads before the timeout,
    // the timer is cleared and no refresh call is fired.
    if (isSsoCallback()) {
      runRestore();
    } else {
      timer = setTimeout(runRestore, 300);
    }

    const unsubscribe = subscribeAuthState((event) => {
      if (!isMounted) return;
      const shouldForce = event?.detail?.force === true;
      void restoreSession({ force: shouldForce });
    });

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
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
