const DEVICE_ID_STORAGE_KEY = "device_id";
let cachedDeviceId = "";

const isBrowser = () => typeof window !== "undefined";

const readStoredDeviceId = () => {
  if (!isBrowser()) return "";
  try {
    return String(window.localStorage.getItem(DEVICE_ID_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
};

const writeStoredDeviceId = (value) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, value);
  } catch {
    // ignore storage errors
  }
};

const bytesToUuid = (bytes) => {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
};

const generateDeviceId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytesToUuid(bytes);
  }

  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getDeviceId = () => {
  if (cachedDeviceId) return cachedDeviceId;

  const stored = readStoredDeviceId();
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }

  if (!isBrowser()) return "";

  const generated = generateDeviceId();
  if (!generated) return "";

  cachedDeviceId = generated;
  writeStoredDeviceId(generated);
  return generated;
};

const isLikelyMobile = () => {
  if (!isBrowser()) return false;

  if (
    typeof navigator !== "undefined" &&
    navigator.userAgentData &&
    typeof navigator.userAgentData.mobile === "boolean"
  ) {
    return navigator.userAgentData.mobile;
  }

  const ua = String(navigator?.userAgent || "");
  return /android|iphone|ipad|ipod|iemobile|windows phone|mobile/i.test(ua);
};

export const getDeviceType = () => (isLikelyMobile() ? "mobile" : "web");

export const getDeviceInfo = () => ({
  device_id: getDeviceId(),
  device_type: getDeviceType(),
});
