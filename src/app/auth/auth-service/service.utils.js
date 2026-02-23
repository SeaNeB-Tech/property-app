export const toText = (value) => String(value || "").trim();
export const toUpper = (value) => toText(value).toUpperCase();
export const limitText = (value, max) => toText(value).slice(0, max);

export const pickFirst = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};

export const toNumberOr = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
};

export const cleanPayload = (payload) =>
  Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );

export const getErrorStatus = (err) => Number(err?.response?.status || 0);
export const getErrorCode = (err) => String(err?.response?.data?.error?.code || "").toLowerCase();
export const getErrorText = (err) =>
  String(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || "").toLowerCase();
export const pickErrorMessage = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || fallback;
