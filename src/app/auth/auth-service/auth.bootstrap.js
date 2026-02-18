import axios from "axios";
import { authStore } from "./store/authStore";
import { getDefaultProductKey, setDefaultProductKey } from "@/services/pro.service";
import { getCookie } from "@/services/cookie";

const getRefreshProductKeyCandidates = () => {
  return ["property"];
};

const getCsrfCandidates = () => [
  authStore.getCsrfToken(),
  getCookie("csrf_token"),
  getCookie("csrf-token"),
  getCookie("XSRF-TOKEN"),
  getCookie("xsrf-token"),
  getCookie("_csrf"),
].filter(Boolean);

const isRetryableRefreshError = (err) => {
  const status = Number(err?.response?.status || 0);
  const code = String(err?.response?.data?.error?.code || "").toUpperCase();
  const message = String(
    err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      ""
  ).toLowerCase();

  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    code.includes("CSRF") ||
    code.includes("PRODUCT") ||
    message.includes("csrf") ||
    message.includes("product")
  );
};

export const bootstrapProductAuth = async ({ force = false } = {}) => {
  console.log("\n[bootstrap] Page reloaded - attempting authentication recovery...");

  const existingAccessToken = authStore.getAccessToken();
  if (existingAccessToken && !force) {
    console.log("    Access token already present - session preserved");
    return existingAccessToken;
  }

  if (force && existingAccessToken) {
    console.log("   Force mode enabled - existing access token will be ignored and re-bootstrapped");
  } else {
    console.log("   No access token in memory - will attempt recovery from cookies");
  }

  try {
    const refreshToken = authStore.getRefreshToken();
    const csrfToken = getCsrfCandidates()[0] || null;
    const productKeyCandidates = getRefreshProductKeyCandidates();

    console.log("\n   Available tokens:");
    console.log(`     CSRF: ${csrfToken ? "FOUND" : "MISSING"}`);
    console.log(`     Refresh: ${refreshToken ? "FOUND" : "MISSING"} (also auto-sent via httpOnly cookie)`);
    console.log(`     Product Keys: ${productKeyCandidates.join(", ")}`);

    if (!csrfToken) {
      const missingCsrfError = new Error("CSRF token missing, cannot bootstrap session");
      missingCsrfError.isRetryable = false;
      throw missingCsrfError;
    }

    let lastErr = null;

    for (const productKey of productKeyCandidates) {
      try {
        console.log(`\n   Strategy: POST /auth/refresh with csrf + product_key=${productKey}`);

        const requestBody = { product_key: productKey };
        if (refreshToken) {
          requestBody.refresh_token = refreshToken;
          console.log("     Also including refresh_token in body");
        }

        const res = await axios.post(
          "https://dev.seaneb.com/api/v1/auth/refresh",
          requestBody,
          {
            withCredentials: true,
            headers: {
              "x-csrf-token": csrfToken,
              "Content-Type": "application/json",
            },
          }
        );

        const newAccessToken = res?.data?.access_token;
        if (!newAccessToken) {
          throw new Error("No access_token returned from refresh");
        }

        authStore.setAccessToken(newAccessToken);

        const newCsrf =
          res?.data?.csrf_token ||
          res?.headers?.["x-csrf-token"] ||
          res?.headers?.["csrf-token"] ||
          res?.headers?.["x-xsrf-token"] ||
          res?.headers?.["xsrf-token"];
        if (newCsrf) {
          authStore.setCsrfToken(newCsrf);
        }

        if (productKey !== getDefaultProductKey()) {
          setDefaultProductKey(productKey);
        }

        console.log("      SUCCESS: Access token regenerated!");
        return newAccessToken;
      } catch (err) {
        lastErr = err;
        console.warn("      Failed:", err?.response?.status, err?.response?.data?.error?.code);

        if (!isRetryableRefreshError(err)) {
          err.isRetryable = false;
          throw err;
        }
      }
    }

    const terminalError = lastErr || new Error("All bootstrap strategies failed");
    terminalError.isRetryable = false;
    throw terminalError;
  } catch (error) {
    console.error("\n[bootstrap] Recovery failed:");
    console.error(`   Status: ${error?.response?.status}`);
    console.error(`   Error Code: ${error?.response?.data?.error?.code}`);
    console.error(`   Message: ${error?.response?.data?.error?.message || error?.message}`);
    throw error;
  }
};
