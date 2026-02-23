import api, { setInMemoryAccessToken } from "@/lib/api/client";
import { authStore } from "./store/authStore";
import { getDefaultProductKey, setDefaultProductKey } from "@/services/product.service";
import { getCookie } from "@/services/cookie";

const getRefreshProductKeyCandidates = () => {
  const key = String(getDefaultProductKey() || "").trim().toLowerCase();
  return key ? [key] : ["property"];
};

const getCsrfCandidates = () => [
  authStore.getCsrfToken(),
  getCookie("csrf_token_property"),
  getCookie("csrf_token"),
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

const readTokenValue = (payload = {}, keys = []) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.payload,
    payload?.response,
    payload?.session,
    payload?.tokens,
    payload?.data?.session,
    payload?.data?.tokens,
  ];

  for (const container of candidates) {
    if (!container || typeof container !== "object") continue;
    for (const key of keys) {
      const value = String(container?.[key] || "").trim();
      if (value) return value;
    }
  }
  return "";
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
    const csrfCandidates = getCsrfCandidates();
    const csrfAttemptList = csrfCandidates.length > 0 ? csrfCandidates : [null];
    const csrfToken = csrfAttemptList[0] || null;
    const productKeyCandidates = getRefreshProductKeyCandidates();

    console.log("\n   Available tokens:");
    console.log(`     CSRF: ${csrfToken ? "FOUND" : "MISSING"}`);
    console.log("     Refresh: expected via httpOnly cookie");
    console.log(`     Product Keys: ${productKeyCandidates.join(", ")}`);

    let lastErr = null;

    for (const currentCsrf of csrfAttemptList) {
      for (const productKey of productKeyCandidates) {
        try {
          console.log(
            `\n   Strategy: POST /auth/refresh with${currentCsrf ? "" : "out"} csrf + product_key=${productKey}`
          );

          const requestBody = { product_key: productKey };

          const res = await api.post(
            "/auth/refresh",
            requestBody,
            {
              withCredentials: true,
              headers: {
                ...(currentCsrf ? { "x-csrf-token": currentCsrf } : {}),
                "Content-Type": "application/json",
              },
            }
          );

          let newAccessToken = readTokenValue(res?.data, ["access_token", "accessToken", "token", "jwt"]);
          if (!newAccessToken) {
            const headerToken = String(
              res?.headers?.authorization ||
                res?.headers?.Authorization ||
                res?.headers?.["x-access-token"] ||
                ""
            ).trim();
            if (/^bearer\s+/i.test(headerToken)) {
              newAccessToken = headerToken.replace(/^bearer\s+/i, "").trim();
            } else {
              newAccessToken = headerToken;
            }
          }
          if (!newAccessToken) {
            throw new Error("No access_token returned from refresh");
          }

          if (currentCsrf) {
            authStore.setCsrfToken(currentCsrf);
          }
          authStore.setAccessToken(newAccessToken);
          setInMemoryAccessToken(newAccessToken);

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


