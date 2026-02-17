// product.service.js

import { authStore } from "@/app/auth/auth-service/store/authStore";
import api from "./api";
import { getCookie, setCookie } from "./cookie";

// Single allowed product across app.
const PRODUCT_KEY = "property";
const PRODUCT_NAME = "Property";
const PRODUCT_COOKIE_KEY = "product_key";
let inMemoryProductKey = "";

const normalizeKey = (key) => String(key || "").trim().toLowerCase();
const isAllowedKey = (key) => normalizeKey(key) === PRODUCT_KEY;

const selectSingleProperty = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const property = list.find((item) => normalizeKey(item?.product_key) === PRODUCT_KEY);
  if (property) {
    return [
      {
        ...property,
        product_key: PRODUCT_KEY,
        product_name: PRODUCT_NAME,
      },
    ];
  }
  return [{ product_key: PRODUCT_KEY, product_name: PRODUCT_NAME }];
};

const getStoredProductKey = () => {
  if (inMemoryProductKey) {
    if (isAllowedKey(inMemoryProductKey)) return inMemoryProductKey;
    inMemoryProductKey = "";
  }

  const cookieKey = String(getCookie(PRODUCT_COOKIE_KEY) || "").trim();
  if (cookieKey && isAllowedKey(cookieKey)) {
    inMemoryProductKey = cookieKey;
    return cookieKey;
  }

  return "";
};

export const setDefaultProductKey = () => {
  const productKey = PRODUCT_KEY;
  inMemoryProductKey = productKey;
  setCookie(PRODUCT_COOKIE_KEY, productKey, {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
};

export const getDefaultProductKey = () => {
  const key = getStoredProductKey() || PRODUCT_KEY;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("product_key");
    } catch (_) {
      // ignore
    }
  }
  setDefaultProductKey();
  return key;
};

export const getDefaultProductName = () => PRODUCT_NAME;

const createDefaultProduct = async () => {
  try {
    await api.post("/products", {
      product_key: PRODUCT_KEY,
      product_name: PRODUCT_NAME,
    });
    return true;
  } catch (err) {
    if (err?.response?.status === 409) return true;
    return false;
  }
};

const isCsrfFailure = (err) => {
  const status = Number(err?.response?.status || 0);
  const code = String(err?.response?.data?.error?.code || "").toUpperCase();
  const message = String(
    err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      ""
  ).toLowerCase();

  return (
    status === 403 &&
    (code.includes("CSRF") || message.includes("csrf token is required") || message.includes("csrf"))
  );
};

export const getProducts = async () => {
  try {
    const token = authStore.getAccessToken();
    if (!token) {
      return [];
    }

    const res = await api.get("/products", {
      params: { product_key: PRODUCT_KEY },
    });

    let data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    data = data.filter((item) => normalizeKey(item?.product_key) === PRODUCT_KEY);

    if (data.length === 0) {
      const created = await createDefaultProduct();
      if (created) {
        const refetch = await api.get("/products", {
          params: { product_key: PRODUCT_KEY },
        });
        data = Array.isArray(refetch.data) ? refetch.data : refetch.data?.data ?? [];
        data = data.filter((item) => normalizeKey(item?.product_key) === PRODUCT_KEY);
      }
    }

    const finalData = selectSingleProperty(data);
    setDefaultProductKey();
    return finalData;
  } catch (err) {
    if (isCsrfFailure(err)) {
      try {
        const { bootstrapProductAuth } = await import("@/app/auth/auth-service/auth.bootstrap");
        await bootstrapProductAuth({ force: true });

        const retry = await api.get("/products", {
          params: { product_key: PRODUCT_KEY },
        });
        const retried = Array.isArray(retry.data) ? retry.data : retry.data?.data ?? [];
        return selectSingleProperty(retried);
      } catch (_) {
        return selectSingleProperty([]);
      }
    }

    if (Number(err?.response?.status || 0) === 401) {
      return [];
    }

    return selectSingleProperty([]);
  }
};
