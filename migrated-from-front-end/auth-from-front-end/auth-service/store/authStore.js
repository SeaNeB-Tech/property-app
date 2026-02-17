"use client";

// src/services/store/authStore.js
// Token storage: All tokens now stored in cookies for persistence across page reloads

const getCookieValue = (name) => {
  if (typeof window === "undefined") return null;
  
  console.log(`[getCookieValue] Searching for "${name}" in cookies`);
  console.log(`  document.cookie: "${document.cookie}"`);
  
  const pairs = document.cookie.split("; ");
  console.log(`  Split into ${pairs.length} cookie pairs`);
  
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (!p) continue;
    
    // FIX: Split only on the FIRST "=" to handle values that contain "="
    const eqIndex = p.indexOf("=");
    if (eqIndex < 0) continue;
    
    const k = p.substring(0, eqIndex);
    const v = p.substring(eqIndex + 1);
    const decodedKey = decodeURIComponent(k || "");
    
    if (decodedKey === name) {
      const decoded = decodeURIComponent(v || "");
      console.log(`FOUND "${name}" in cookies!`);
      console.log(`  Value length: ${decoded.length}`);
      console.log(`  First 30 chars: ${decoded.substring(0, 30)}...`);
      return decoded;
    }
  }
  
  console.log(`"${name}" NOT found in cookies`);
  return null;
};

const getFirstCookieValue = (names = []) => {
  for (const name of names) {
    const value = getCookieValue(name);
    if (value) return value;
  }
  return null;
};

const getAllCookies = () => {
  if (typeof window === "undefined") return {};
  const pairs = document.cookie.split("; ");
  const cookies = {};
  
  for (let p of pairs) {
    if (!p) continue;
    
    // FIX: Split only on the FIRST "=" to handle values that contain "="
    const eqIndex = p.indexOf("=");
    if (eqIndex < 0) continue;
    
    const k = p.substring(0, eqIndex);
    const v = p.substring(eqIndex + 1);
    cookies[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return cookies;
};

const setCookie = (name, value, maxAgeSeconds) => {
  if (typeof window === "undefined") return;
  
  console.log(`\n[setCookie] Setting "${name}" with maxAge=${maxAgeSeconds}s`);
  
  if (value) {
    console.log(`  Value length: ${value.length}`);
    console.log(`  Value (first 30): ${value.substring(0, 30)}...`);
    
    // Encode value for safe transmission
    const encoded = encodeURIComponent(value);
    
    // Build cookie string with all proper attributes
    // path=/ means available on all routes
    // max-age sets how long cookie persists
    // SameSite=Lax allows cookie on cross-site top-level navigation
    const cookieString = `${name}=${encoded}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
    
    console.log(`  Cookie string length: ${cookieString.length}`);
    console.log(`  Setting to document.cookie...`);
    
    // SET THE COOKIE
    document.cookie = cookieString;
    console.log(`  document.cookie assignment executed`);
    
    // Verify immediately - read it back
    console.log(`  Verifying cookie was stored...`);
    const retrieved = getCookieValue(name);
    
    if (retrieved === value) {
      console.log(`  SUCCESS: Cookie stored and retrieved correctly!`);
      return true;
    } else if (retrieved) {
      console.warn(`  Cookie stored but value mismatch (encoding issue?)`);
      console.warn(`     Expected: ${value.substring(0, 20)}...`);
      console.warn(`     Got: ${retrieved.substring(0, 20)}...`);
      return true;
    } else {
      console.error(`  FAILED: Cookie was NOT stored!`);
      console.error(`     Browser may have rejected it`);
      console.error(`     Cookie string: ${cookieString}`);
      return false;
    }
  } else {
    // Clear cookie
    document.cookie = `${name}=; path=/; max-age=0`;
    console.log(`   Cookie cleared`);
  }
};

const authStore = {
  accessToken: null,
  refreshToken: null,
  csrfToken: null,


  getAccessToken() {
    // Check in-memory first
    if (this.accessToken) {
      console.log("[authStore.getAccessToken] Returning from memory (length=" + this.accessToken.length + ")");
      return this.accessToken;
    }

    // Fall back to cookie (persists across page reloads)
    const token = getCookieValue("access_token");
    if (token) {
      console.log("[authStore.getAccessToken] Retrieved from cookie (length=" + token.length + ")");
      this.accessToken = token;
      return token;
    }

    console.warn("[authStore.getAccessToken] Access token not found in memory or cookies");
    return null;
  },

  setAccessToken(token) {
    this.accessToken = token || null;

    if (typeof window !== "undefined") {
      if (token) {
        // Store access token in cookie (15 minute lifespan)
        setCookie("access_token", token, 15 * 60);
        // Track when this token was issued (for proactive refresh)
        setCookie("access_token_issued_time", Date.now().toString(), 15 * 60);
        
        // Verify storage
        const verified = getCookieValue("access_token");
        if (verified === token) {
          console.log("[authStore] Access token stored in cookie (expires in 15 minutes) - VERIFIED");
        } else {
          console.error("[authStore] Access token FAILED to store in cookie!");
        }
      } else {
        setCookie("access_token", null, 0);
        setCookie("access_token_issued_time", null, 0);
      }
    }
  },


  getRefreshToken() {
    if (this.refreshToken) return this.refreshToken;

    // Refresh token is set as HttpOnly cookie by backend, we can't read it directly
    // But we can try to read a readable version if backend also sets one
    const token = getCookieValue("refresh_token");
    if (token) {
      this.refreshToken = token;
      return token;
    }

    return null;
  },

  setRefreshToken(token) {
    this.refreshToken = token || null;

    if (typeof window !== "undefined") {
      if (token) {
        // Store refresh token in cookie (30 day lifespan)
        setCookie("refresh_token", token, 60 * 60 * 24 * 30);
        console.log("[authStore] Refresh token stored in cookie");
      } else {
        setCookie("refresh_token", null, 0);
      }
    }
  },


  getSessionStartTime() {
    const time = getCookieValue("session_start_time");
    if (time) {
      return parseInt(time, 10);
    }
    return null;
  },

  setSessionStartTime() {
    if (typeof window !== "undefined") {
      const now = Date.now().toString();
      // 6 hours session validity
      setCookie("session_start_time", now, 6 * 60 * 60);
      console.log("[authStore] Session start time recorded (6 hour validity)");
    }
  },


  setSession({ access_token, refresh_token, csrf_token }) {
    this.setAccessToken(access_token);
    this.setRefreshToken(refresh_token);
    this.setCsrfToken(csrf_token);
    this.setSessionStartTime();
  },


  getCsrfToken() {
    // Check in-memory first
    if (this.csrfToken) {
      console.log("[authStore.getCsrfToken] Returning from memory");
      return this.csrfToken;
    }

    // Fall back to cookie (persists across page reloads)
    const token = getFirstCookieValue([
      "csrf_token",
      "csrf-token",
      "XSRF-TOKEN",
      "xsrf-token",
      "XSRF_TOKEN",
      "_csrf",
    ]);
    if (token) {
      console.log("[authStore.getCsrfToken] Retrieved from cookie (length=" + token.length + ")");
      this.csrfToken = token;
      return token;
    }

    console.warn("[authStore.getCsrfToken] CSRF token not found in memory or cookies");
    return null;
  },

  setCsrfToken(token) {
    this.csrfToken = token || null;

    if (typeof window !== "undefined") {
      if (token) {
          // Store both variants because backend/docs use mixed naming.
          setCookie("csrf_token", token, 6 * 60 * 60);
          setCookie("csrf-token", token, 6 * 60 * 60);
          setCookie("XSRF-TOKEN", token, 6 * 60 * 60);
        
          // Verify it was stored
          const verified =
            getCookieValue("csrf_token") ||
            getCookieValue("csrf-token") ||
            getCookieValue("XSRF-TOKEN");
          if (verified === token) {
            console.log("[authStore] CSRF token stored in cookie (length=" + token.length + ") - VERIFIED");
          } else {
            console.error("[authStore] CSRF token FAILED to store in cookie!");
            console.error("   Expected:", token.substring(0, 20) + "...");
            console.error("   Got:", verified ? verified.substring(0, 20) + "..." : "NOTHING");
          }
      } else {
        setCookie("csrf_token", null, 0);
        setCookie("csrf-token", null, 0);
        setCookie("XSRF-TOKEN", null, 0);
        console.log("[authStore] CSRF token cleared");
      }
    }
  },


  clearAll() {
    this.accessToken = null;
    this.refreshToken = null;
    this.csrfToken = null;

    if (typeof window !== "undefined") {
      setCookie("access_token", null, 0);
      setCookie("csrf_token", null, 0);
      setCookie("csrf-token", null, 0);
      setCookie("XSRF-TOKEN", null, 0);
      setCookie("refresh_token", null, 0);
      setCookie("session_start_time", null, 0);
      setCookie("access_token_issued_time", null, 0);
      
      console.log("[authStore] All tokens cleared - session ended (logout)");
      console.log("   → User must login again");
    }
  },


  dumpAuthState() {
    console.log("\n [authStore] Authentication State Dump:");
    console.log("   In-memory state:");
    console.log(`     - accessToken: ${this.accessToken ? `EXISTS (${this.accessToken.length} chars)` : "MISSING"}`);
    console.log(`     - refreshToken: ${this.refreshToken ? `EXISTS (${this.refreshToken.length} chars)` : "MISSING"}`);
    console.log(`     - csrfToken: ${this.csrfToken ? `EXISTS (${this.csrfToken.length} chars)` : "MISSING"}`);
    
    if (typeof window !== "undefined") {
      console.log("   Cookies:");
      const allCookies = getAllCookies();
      Object.keys(allCookies).forEach(key => {
        const value = allCookies[key];
        const isAuthCookie = key.includes("access") || key.includes("csrf") || key.includes("refresh") || key.includes("session");
        if (isAuthCookie) {
          console.log(`     - ${key}: ${value ? `${value.substring(0, 20)}...` : "EMPTY"}`);
        }
      });
    }
  },


  initFromResponseHeaders(headers) {
    if (!headers) return;

    const csrf =
      headers["x-csrf-token"] ||
      headers["csrf-token"] ||
      headers["x-xsrf-token"] ||
      headers["xsrf-token"];

    if (csrf) {
      this.setCsrfToken(csrf);
    }
  }
};

export { authStore, getAllCookies };
