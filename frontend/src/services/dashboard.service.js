import { authStore } from "@/app/auth/auth-service/store/authStore";
import api from "@/lib/api/client";
import { getCookie, setCookie } from "@/lib/core/cookies";

export const DASHBOARD_MODE_USER = "user";
export const DASHBOARD_MODE_BUSINESS = "business";

const DASHBOARD_MODE_COOKIE = "dashboard_mode";
const BUSINESS_REGISTERED_COOKIE = "business_registered";

export const getDashboardMode = () => {
  const mode = String(getCookie(DASHBOARD_MODE_COOKIE) || "").trim().toLowerCase();
  if (mode === DASHBOARD_MODE_BUSINESS) return DASHBOARD_MODE_BUSINESS;
  return DASHBOARD_MODE_USER;
};

export const setDashboardMode = (mode) => {
  const safeMode = mode === DASHBOARD_MODE_BUSINESS ? DASHBOARD_MODE_BUSINESS : DASHBOARD_MODE_USER;
  setCookie(DASHBOARD_MODE_COOKIE, safeMode, { maxAge: 60 * 60 * 24 * 30, path: "/" });
  return safeMode;
};

export const isBusinessRegistered = () => getCookie(BUSINESS_REGISTERED_COOKIE) === "true";

const PRODUCT_KEY = String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "property").trim().toLowerCase() || "property";
const PRODUCT_NAME = "property";
let inMemoryProductKey = "";

const normalizeKey = (key) => {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized === PRODUCT_KEY ? PRODUCT_KEY : "";
};

const selectSingleProperty = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const preferred = normalizeKey(getDefaultProductKey());
  const selected =
    list.find((item) => normalizeKey(item?.product_key) === preferred) ||
    list.find((item) => normalizeKey(item?.product_key) === PRODUCT_KEY) ||
    list[0];

  if (selected) {
    return [
      {
        ...selected,
        product_key: normalizeKey(selected?.product_key) || preferred || PRODUCT_KEY,
        product_name: String(selected?.product_name || selected?.name || PRODUCT_NAME),
      },
    ];
  }

  const fallbackKey = preferred || PRODUCT_KEY;
  return [{ product_key: fallbackKey, product_name: PRODUCT_NAME }];
};

const getStoredProductKey = () => normalizeKey(inMemoryProductKey);

export const setDefaultProductKey = (key) => {
  const nextKey = normalizeKey(key) || PRODUCT_KEY;
  inMemoryProductKey = nextKey;

  return nextKey;
};

export const getDefaultProductKey = () => {
  const key = getStoredProductKey() || PRODUCT_KEY;
  const safeKey = normalizeKey(key) || PRODUCT_KEY;
  setDefaultProductKey(safeKey);
  return safeKey;
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
      } catch {
        return selectSingleProperty([]);
      }
    }

    if (Number(err?.response?.status || 0) === 401) {
      return [];
    }

    return selectSingleProperty([]);
  }
};

export const getCities = async (input) => {
  if (typeof input !== "string" || input.trim().length < 2) {
    return [];
  }

  try {
    const res = await api.get("/cities", {
      params: {
        search: input.trim(),
        limit: 20,
      },
    });

    const body = res?.data;
    const cities = Array.isArray(body) ? body : body?.cities || [];

    if (Array.isArray(cities) && cities.length > 0) {
      return cities;
    }

    const fallback = await api.get("/autocomplete-cities", {
      params: {
        input: input.trim(),
      },
    });
    const fallbackCities = fallback?.data?.cities;

    return Array.isArray(fallbackCities) ? fallbackCities : [];
  } catch (error) {
    console.error(" getCities failed:", error?.response?.data || error?.message || error);
    return [];
  }
};
