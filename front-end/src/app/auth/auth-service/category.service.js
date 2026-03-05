import api from "@/lib/api/client";
import { getProducts, getDefaultProductKey } from "@/services/dashboard.service";

const normalizeCategoryRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.categories)) return payload.categories;
  if (Array.isArray(payload?.data?.categories)) return payload.data.categories;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
};

const toCategoryId = (row) =>
  String(
    row?.main_category_id ??
      row?.category_id ??
      row?.id ??
      ""
  ).trim();

const toCategoryName = (row) =>
  String(
    row?.main_category_name ??
      row?.category_name ??
      row?.name ??
      ""
  ).trim();

const pickMainCategoryId = (payload) => {
  const rows = normalizeCategoryRows(payload);
  const first = rows.find((row) => toCategoryId(row));
  return toCategoryId(first);
};

const findCategoryIdByName = (payload, name) => {
  const needle = String(name || "").trim().toLowerCase();
  if (!needle) return "";
  const rows = normalizeCategoryRows(payload);
  const match = rows.find((row) => toCategoryName(row).toLowerCase() === needle);
  return toCategoryId(match);
};

const withCategoryRecovery = async (requestFn) => {
  try {
    return await requestFn();
  } catch (err) {
    throw err;
  }
};

export const createMainCategory = async (categoryName) => {
  const name = String(categoryName || "").trim();
  if (!name) {
    return Promise.reject(new Error("Category name is required"));
  }

  try {
    // Avoid expected 409s by reusing category when it already exists.
    const existingCategories = await getAllActiveCategories();
    const existingCategoryId = findCategoryIdByName(existingCategories, name);
    if (existingCategoryId) {
      console.log(`[category.service] Reusing existing category "${name}" (${existingCategoryId})`);
      return existingCategoryId;
    }

    console.log(`[category.service] Creating main category: ${name}`);
    const productKey = getDefaultProductKey();
    const makeRequest = () =>
      api.post(
        "/category/create",
        {
          main_category_name: name,
          product_key: productKey,
        }
      );
    const res = await withCategoryRecovery(makeRequest);

    const categoryId = res?.data?.main_category_id || res?.data?.id;
    console.log(`[category.service] Category created successfully:`, categoryId);
    return String(categoryId || "").trim();
  } catch (err) {
    const status = err?.response?.status;
    const errorCode = err?.response?.data?.error?.code;

    // 409 means category already exists
    if (status === 409 || errorCode === "CATEGORY_ALREADY_EXISTS") {
      console.warn(`[category.service] Category "${name}" already exists (409)`);
      const existing = await getAllActiveCategories();
      return findCategoryIdByName(existing, name) || "";
    }

    console.error("[category.service] createMainCategory failed:", err?.response?.data || err?.message || err);
    throw err;
  }
};

export const getAllActiveCategories = async () => {
  try {
    console.log("[category.service] Fetching all active categories...");
    const productKey = getDefaultProductKey();
    const makeRequest = () =>
      api.get("/category/categorieslist", {
        params: { product_key: productKey },
      });
    const res = await withCategoryRecovery(makeRequest);
    console.log("[category.service] getAllActiveCategories response:", res?.data);
    
    if (!res?.data) return [];

    let rows = normalizeCategoryRows(res.data);
    if (!rows.length) {
      const products = await getProducts();
      const firstProductId = products?.[0]?.product_id || products?.[0]?.id || "";
      if (firstProductId) {
        rows = await getCategoriesList(firstProductId);
      }
    }
    console.log("[category.service] Extracted rows:", rows);
    return rows;
  } catch (err) {
    console.warn("[category.service] getAllActiveCategories failed:", err?.response?.data || err?.message || err);
    return [];
  }
};

export const getMainCategoryId = async () => {
  try {
    const productKey = getDefaultProductKey();
    const makeRequest = () =>
      api.get("/category/categorieslist", {
        params: { product_key: productKey },
      });
    const res = await withCategoryRecovery(makeRequest);
    return pickMainCategoryId(res?.data);
  } catch (err) {
    console.warn("[category.service] getMainCategoryId failed:", err?.response?.data || err?.message || err);
    return "";
  }
};

export const getCategoriesList = async (productId) => {
  const id = String(productId || "").trim();
  if (!id) return [];

  try {
    const productKey = getDefaultProductKey();
    const makeRequest = () =>
      api.post(
        "/category/list",
        { product_id: id, product_key: productKey }
      );
    const res = await withCategoryRecovery(makeRequest);
    if (!res?.data) return [];

    return normalizeCategoryRows(res.data);
  } catch (err) {
    console.warn("[category.service] getCategoriesList failed:", err?.response?.data || err?.message || err);
    return [];
  }
};

export const getProductCategories = async (productId) => {
  const id = String(productId || "").trim();
  if (!id) return "";

  const productKey = getDefaultProductKey();
  const makeRequest = () =>
    api.post(
      "/category/list",
      { product_id: id, product_key: productKey }
    );
  const res = await withCategoryRecovery(makeRequest);
  return pickMainCategoryId(res?.data);
};

export const resolveMainCategoryId = async () => {
  try {
    const categories = await getAllActiveCategories();
    const realEstate = findCategoryIdByName(categories, "Real Estate");
    if (realEstate) return realEstate;
    const first = pickMainCategoryId(categories);
    if (first) return first;
  } catch (err) {
    console.warn("[category.service] categorieslist failed:", err?.response?.data || err?.message || err);
  }

  try {
    const products = await getProducts();
    const firstProductId = products?.[0]?.product_id || products?.[0]?.id || "";
    if (!firstProductId) return "";

    const byProduct = await getProductCategories(firstProductId);
    return byProduct || "";
  } catch (err) {
    console.warn("[category.service] product category lookup failed:", err?.response?.data || err?.message || err);
    return "";
  }
};

