const isBrowser = typeof window !== "undefined";

const REFRESH_LOCK_KEY = "seaneb:auth:refresh:lock";
const REFRESH_LAST_AT_KEY = "seaneb:auth:refresh:last_at";
const REFRESH_LOCK_TTL_MS = 8000;
const REFRESH_LOCK_WAIT_MS = 2000;
const REFRESH_LOCK_POLL_MS = 50;
const REFRESH_COOLDOWN_MS = 500;
const REFRESH_DEBOUNCE_MS = 150;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readLock = () => {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(REFRESH_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeLock = (entry) => {
  if (!isBrowser) return false;
  try {
    window.localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
};

const clearLock = () => {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(REFRESH_LOCK_KEY);
  } catch {
    // ignore storage cleanup errors
  }
};

const readLastRefreshAt = () => {
  if (!isBrowser) return 0;
  try {
    const raw = window.localStorage.getItem(REFRESH_LAST_AT_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
};

const writeLastRefreshAt = (value) => {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(REFRESH_LAST_AT_KEY, String(value || ""));
  } catch {
    // ignore storage write errors
  }
};

const isLockExpired = (entry) => {
  const expiresAt = Number(entry?.expiresAt || 0);
  return !expiresAt || Date.now() >= expiresAt;
};

export const acquireRefreshLock = async ({
  waitMs = REFRESH_LOCK_WAIT_MS,
  pollMs = REFRESH_LOCK_POLL_MS,
  debounceMs = REFRESH_DEBOUNCE_MS,
  source = "",
} = {}) => {
  if (!isBrowser) {
    return { acquired: true, id: "memory" };
  }

  if (debounceMs) {
    await sleep(debounceMs);
  }

  const lastAt = readLastRefreshAt();
  if (lastAt && REFRESH_COOLDOWN_MS) {
    const delta = Date.now() - lastAt;
    if (delta < REFRESH_COOLDOWN_MS) {
      await sleep(Math.min(REFRESH_COOLDOWN_MS - delta, waitMs));
    }
  }

  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const existing = readLock();
    if (!existing || isLockExpired(existing)) {
      break;
    }
    await sleep(pollMs);
  }

  const current = readLock();
  if (current && !isLockExpired(current)) {
    return { acquired: false, id: String(current.id || "") };
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeLock({
    id,
    source: String(source || "").trim(),
    startedAt: Date.now(),
    expiresAt: Date.now() + REFRESH_LOCK_TTL_MS,
  });

  const verify = readLock();
  if (!verify || verify.id !== id) {
    return { acquired: false, id: String(verify?.id || "") };
  }

  return { acquired: true, id };
};

export const releaseRefreshLock = (id) => {
  if (!isBrowser) return;
  const current = readLock();
  if (!current || current.id !== id) return;
  clearLock();
  writeLastRefreshAt(Date.now());
};
