// api.js
import axios from "axios";
import { authStore } from "@/app/auth/auth-service/store/authStore";
import { refreshAccessToken } from "@/app/auth/auth-service/authservice";
import { API_BASE_URL } from "@/lib/apiBaseUrl";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = authStore.getAccessToken();
  const csrfToken = authStore.getCsrfToken();
  config.headers = config.headers || {};

  console.log(`\n [api-request] ${config.method?.toUpperCase()} ${config.url}`);
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log(`    Authorization: Bearer ${token.substring(0, 20)}...`);
  } else {
    console.warn(`    NO ACCESS TOKEN - continuing (public endpoint or bootstrap state)`);
  }

  if (csrfToken) {
    config.headers["x-csrf-token"] = csrfToken;
    console.log(`    x-csrf-token: ${csrfToken.substring(0, 20)}...`);
  } else {
    console.warn(`    NO CSRF TOKEN - Request may fail if endpoint requires csrf`);
  }

  if (config.params) {
    console.log(`   Params:`, config.params);
  }

  return config;
});

let isRefreshing = false;
let refreshPromise = null;

api.interceptors.response.use(
  (res) => {
    // Capture CSRF or auth-related headers set by backend so we can
    // initialize client-side auth state (cookies or tokens) as needed.
    try {
      authStore.initFromResponseHeaders(res.headers);
    } catch (e) {
      // ignore
    }

    console.log(`\n [api-response] ${res.status} ${res.config.url}`);
    console.log(`   Response received successfully`);
    return res;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    const errorMsg = error.response?.data?.error?.message || error.response?.data?.message;

    console.error(`\n [api-response] ${status} ${error.config?.url}`);
    console.error(`   Error Code: ${errorCode}`);
    console.error(`   Error Message: ${errorMsg}`);

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;

        refreshPromise = (async () => {
          try {
            console.log("\n [api-interceptor] 401 detected - access token expired, attempting refresh...");
            console.log(`   Original request: ${originalRequest.method?.toUpperCase()} ${originalRequest.url}`);

            // Use centralized refresh implementation which knows how to call
            // the backend refresh endpoint (sends HttpOnly cookie + CSRF)
            const newAccessToken = await refreshAccessToken();

            authStore.setAccessToken(newAccessToken);
            console.log(" [api-interceptor] Access token refreshed successfully");
            console.log("   Retrying original request with new token...");

            return newAccessToken;
          } catch (err) {
            console.error("\n [api-interceptor] Token refresh failed:", err?.message || err);
            console.error(`   Status: ${err?.response?.status}`);
            console.error(`   Error: ${err?.response?.data?.error?.message || err?.response?.data?.message}`);

            // Check if this is a session expiry (after 6 hours)
            const isSessionExpired = 
              err?.response?.status === 401 &&
              (err?.response?.data?.reason === "SESSION_EXPIRED" ||
               err?.response?.data?.message?.includes("SESSION_EXPIRED"));

            if (isSessionExpired) {
              console.error("\n⏰ [api-interceptor] SESSION_EXPIRED detected - 6 hour session has ended");
            } else {
              console.error("   → Token refresh failed, clearing session");
            }

            // Clear local session state but DO NOT perform a global redirect here.
            // Let the page-level logic decide whether to navigate to login so
            // we avoid unexpected flashes/redirects during bootstrap.
            try {
              authStore.clearAll();
            } catch (e) {
              console.warn("[api-interceptor] authStore.clearAll() failed:", e);
            }

            // Emit an event so interested components/pages can react if needed.
            if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
              try {
                window.dispatchEvent(new CustomEvent("auth:refresh-failed", { detail: { error: err, isSessionExpired } }));
              } catch (e) {
                // older browsers may not support CustomEvent constructor
                try {
                  const ev = document.createEvent("Event");
                  ev.initEvent("auth:refresh-failed", true, true);
                  window.dispatchEvent(ev);
                } catch (ee) {
                  // ignore
                }
              }
            }

            throw err;
          } finally {
            isRefreshing = false;
          }
        })();
      }

      const newToken = await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;
